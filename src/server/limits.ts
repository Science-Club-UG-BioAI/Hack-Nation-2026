import { AppError } from "@/core/errors";
import { numberSetting } from "./config";

type State = {
  active: number;
  total: number;
  sessions: Map<string, { count: number; reset: number }>;
};
const globalState = globalThis as typeof globalThis & {
  prawdowidLimits?: State;
};
const state = (globalState.prawdowidLimits ??= {
  active: 0,
  total: 0,
  sessions: new Map(),
});
export function forgetSessionLimits(session: string) {
  state.sessions.delete(session);
}

export function acquire(session: string): () => void {
  const now = Date.now();
  for (const [key, value] of state.sessions)
    if (value.reset <= now) state.sessions.delete(key);
  const entry = state.sessions.get(session) ?? {
    count: 0,
    reset: now + 600_000,
  };
  if (
    entry.count >= 10 ||
    state.active >= numberSetting("MAX_CONCURRENT_VERIFICATIONS", 3, 10) ||
    (!state.sessions.has(session) && state.sessions.size >= 1000) ||
    state.total >= numberSetting("MAX_LIVE_VERIFICATIONS", 100, 10_000)
  ) {
    throw new AppError(
      "RATE_LIMITED",
      "Osiągnięto limit analiz lub serwer jest zajęty. Spróbuj później.",
      429,
      true,
    );
  }
  entry.count++;
  state.sessions.set(session, entry);
  state.active++;
  state.total++;
  let released = false;
  return () => {
    if (!released) {
      state.active--;
      released = true;
    }
  };
}
