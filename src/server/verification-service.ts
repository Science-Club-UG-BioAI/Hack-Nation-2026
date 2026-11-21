import { createHash } from "node:crypto";
import type { VerificationResult, VerifyInput } from "@/core/contracts";
import { acquire, forgetSessionLimits } from "./limits";
import { verify } from "./verify";
import { buildEvidenceGraph } from "./evidence-graph";
import { numberSetting } from "./config";
import { assertSessionActive } from "./audit-store";
import type { ProgressListener } from "@/core/progress";

const TTL = 5 * 60_000;
type Entry = {
  session: string;
  result: VerificationResult;
  expires: number;
  timer: ReturnType<typeof setTimeout>;
  channels: Set<string>;
};
type State = {
  cache: Map<string, Entry>;
  pending: Map<
    string,
    {
      session: string;
      wantsGraph: boolean;
      channels: Set<string>;
      controller: AbortController;
      promise: Promise<VerificationResult>;
    }
  >;
};
const globals = globalThis as typeof globalThis & {
  prawdowidVerificationsV5?: State;
};
const state: State = (globals.prawdowidVerificationsV5 ??= {
  cache: new Map(),
  pending: new Map(),
});

export function clearSessionVerifications(session: string) {
  forgetSessionLimits(session);
  for (const [key, entry] of state.cache)
    if (entry.session === session) {
      clearTimeout(entry.timer);
      state.cache.delete(key);
    }
  for (const [key, entry] of state.pending)
    if (entry.session === session) {
      entry.controller.abort();
      state.pending.delete(key);
    }
}

function keyFor(input: VerifyInput, session: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "reasoned-guard-v2",
        "findings-v1-p02-graph",
        session,
        input.claim.normalize("NFC").trim(),
        input.statedAt ?? null,
        process.env.GEMINI_MODEL ?? "default",
        process.env.GEMINI_FALLBACK_MODEL ?? "default",
      ]),
    )
    .digest("hex");
}

function waiting<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

// Same session + exact input + same configuration => same evidence snapshot in both channels.
// In-memory only, bounded, automatically removed after five minutes; never a canned answer.
export async function runVerification(
  input: VerifyInput,
  session: string,
  requestId: string,
  signal: AbortSignal,
  onProgress?: ProgressListener,
  channel: "web" | "discord_demo" = "web",
  deadlineAt = Date.now() + numberSetting("VERIFY_TIMEOUT_MS", 60_000, 60_000),
): Promise<{ result: VerificationResult; reused: boolean }> {
  signal.throwIfAborted();
  assertSessionActive(session);
  const key = keyFor(input, session);
  const wantsGraph = input.evidenceGraph === true;
  const deliver = (result: VerificationResult, reused: boolean) => {
    if (!wantsGraph) {
      const { evidenceGraph: _graph, graphStatus: _status, ...legacy } = result;
      return { result: structuredClone(legacy), reused };
    }
    return { result: structuredClone(result), reused };
  };
  const cached = state.cache.get(key);
  const previous =
    cached &&
    cached.expires > Date.now() &&
    (cached.result.status !== "unable_to_verify" ||
      !cached.channels.has(channel))
      ? cached.result
      : undefined;
  if (cached && !previous) {
    clearTimeout(cached.timer);
    state.cache.delete(key);
  }
  if (
    previous &&
    (!wantsGraph ||
      previous.status === "unable_to_verify" ||
      previous.graphStatus === "ready" ||
      previous.graphStatus === "unavailable" ||
      previous.status === "out_of_scope" ||
      previous.status === "needs_clarification")
  ) {
    cached!.channels.add(channel);
    onProgress?.({ type: "stage", stage: "reused" });
    return deliver(
      wantsGraph && !previous.graphStatus
        ? { ...previous, graphStatus: "unavailable" }
        : previous,
      true,
    );
  }
  const pending = state.pending.get(key);
  if (pending) {
    pending.channels.add(channel);
    onProgress?.({ type: "stage", stage: "waiting" });
    const shared = await waiting(pending.promise, signal);
    if (!wantsGraph || pending.wantsGraph) return deliver(shared, true);
    if (shared.status === "unable_to_verify")
      return deliver({ ...shared, graphStatus: "failed" }, true);
    return runVerification(
      input,
      session,
      requestId,
      signal,
      onProgress,
      channel,
      deadlineAt,
    );
  }
  let release: () => void;
  try {
    release = acquire(session);
  } catch (error) {
    if (previous) return deliver({ ...previous, graphStatus: "failed" }, true);
    throw error;
  }
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const channels = previous && cached ? cached.channels : new Set<string>();
  channels.add(channel);
  const graphController = new AbortController();
  const graphDeadline = deadlineAt - 2_500;
  const graph = wantsGraph
    ? buildEvidenceGraph(
        input,
        previous?.requestId ?? requestId,
        AbortSignal.any([
          combined,
          graphController.signal,
          AbortSignal.timeout(Math.max(1, graphDeadline - Date.now())),
        ]),
        graphDeadline,
        onProgress,
      ).catch((error: unknown) => {
        console.info(
          JSON.stringify({
            requestId,
            event: "evidence_graph_failed",
            errorType: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        return undefined;
      })
    : undefined;
  const legacyTask = previous
    ? Promise.resolve(previous)
    : verify(input, requestId, combined, onProgress);
  const task = legacyTask
    .then(async (legacy): Promise<VerificationResult> => {
      let result = legacy;
      if (graph) {
        if (
          legacy.status === "out_of_scope" ||
          legacy.status === "needs_clarification"
        ) {
          graphController.abort();
          result = { ...legacy, graphStatus: "unavailable" };
        } else {
          const evidenceGraph = await graph;
          result = evidenceGraph
            ? { ...legacy, evidenceGraph, graphStatus: "ready" }
            : { ...legacy, graphStatus: "failed" };
        }
      }
      combined.throwIfAborted();
      assertSessionActive(session);
      // Preserve the same attempt for the other channel, including failed audits.
      // A repeat in a channel that already saw an unsuccessful attempt retries it.
      {
        const old = state.cache.get(key);
        if (old) clearTimeout(old.timer);
        if (!old && state.cache.size >= 100) {
          const oldest = state.cache.keys().next().value!;
          clearTimeout(state.cache.get(oldest)!.timer);
          state.cache.delete(oldest);
        }
        const timer = setTimeout(() => state.cache.delete(key), TTL);
        timer.unref();
        state.cache.set(key, {
          session,
          result: structuredClone(result),
          expires: Date.now() + TTL,
          timer,
          channels,
        });
      }
      return result;
    })
    .finally(() => {
      graphController.abort();
      state.pending.delete(key);
      release();
    });
  state.pending.set(key, {
    session,
    controller,
    promise: task,
    wantsGraph,
    channels,
  });
  return deliver(await task, false);
}
