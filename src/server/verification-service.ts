import { createHash } from "node:crypto";
import type { VerificationResult, VerifyInput } from "@/core/contracts";
import { acquire, forgetSessionLimits } from "./limits";
import { verify } from "./verify";
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
      controller: AbortController;
      promise: Promise<VerificationResult>;
      channels: Set<string>;
    }
  >;
};
const globals = globalThis as typeof globalThis & {
  prawdowidVerificationsV4?: State;
};
const state = (globals.prawdowidVerificationsV4 ??= {
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
        "findings-v1-p02",
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
) {
  signal.throwIfAborted();
  assertSessionActive(session);
  const key = keyFor(input, session);
  const cached = state.cache.get(key);
  if (
    cached &&
    cached.expires > Date.now() &&
    (cached.result.status !== "unable_to_verify" ||
      !cached.channels.has(channel))
  ) {
    cached.channels.add(channel);
    onProgress?.({ type: "stage", stage: "reused" });
    return { result: structuredClone(cached.result), reused: true };
  }
  if (cached) {
    clearTimeout(cached.timer);
    state.cache.delete(key);
  }
  const pending = state.pending.get(key);
  if (pending) {
    pending.channels.add(channel);
    onProgress?.({ type: "stage", stage: "waiting" });
    return {
      result: structuredClone(await waiting(pending.promise, signal)),
      reused: true,
    };
  }
  const release = acquire(session);
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const channels = new Set([channel]);
  const task = verify(input, requestId, combined, onProgress)
    .then((result) => {
      combined.throwIfAborted();
      assertSessionActive(session);
      // The other channel may display the same failed attempt. Retrying from a
      // channel that already received it performs a fresh verification. Exceptions
      // (provider/transport errors) never enter this snapshot store.
      if (state.cache.size >= 100) {
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
      return result;
    })
    .finally(() => {
      state.pending.delete(key);
      release();
    });
  state.pending.set(key, { session, controller, promise: task, channels });
  return { result: await task, reused: false };
}
