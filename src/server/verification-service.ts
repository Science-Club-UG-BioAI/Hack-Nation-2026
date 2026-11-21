import { createHash } from "node:crypto";
import type { VerificationResult, VerifyInput } from "@/core/contracts";
import { acquire, forgetSessionLimits } from "./limits";
import { verify } from "./verify";
import { projectVerificationGraph } from "./verification-graph";
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
        "findings-v1-graph-projection",
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
    return {
      result: structuredClone(
        result.status === "completed"
          ? result
          : { ...result, graphStatus: "unavailable" },
      ),
      reused,
    };
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
  if (previous) {
    cached!.channels.add(channel);
    onProgress?.({ type: "stage", stage: "reused" });
    return deliver(previous, true);
  }
  const pending = state.pending.get(key);
  if (pending) {
    pending.channels.add(channel);
    onProgress?.({ type: "stage", stage: "waiting" });
    return deliver(await waiting(pending.promise, signal), true);
  }
  const release = acquire(session);
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const channels = new Set<string>([channel]);
  // Store the projection with the shared result so either channel can request it
  // later without repeating the audited analysis or retaining raw documents.
  const task = verify(
    input,
    requestId,
    combined,
    onProgress,
    (result, documents) => {
      try {
        if (wantsGraph)
          onProgress?.({ type: "stage", stage: "graph_validating" });
        const evidenceGraph = projectVerificationGraph(result, documents);
        return { evidenceGraph, graphStatus: "ready" };
      } catch (error) {
        console.warn(
          JSON.stringify({
            requestId,
            event: "evidence_graph_failed",
            errorType: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        return { graphStatus: "failed" };
      }
    },
  )
    .then((result) => {
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
      state.pending.delete(key);
      release();
    });
  state.pending.set(key, {
    session,
    controller,
    promise: task,
    channels,
  });
  return deliver(await task, false);
}
