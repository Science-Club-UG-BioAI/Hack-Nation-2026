import { afterEach, beforeEach, expect, it, vi } from "vitest";

type LimitGlobals = typeof globalThis & { prawdowidLimits?: unknown };
beforeEach(() => {
  vi.resetModules();
  delete (globalThis as LimitGlobals).prawdowidLimits;
  vi.stubEnv("MAX_LIVE_VERIFICATIONS", "10000");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete (globalThis as LimitGlobals).prawdowidLimits;
});

it("allows known sessions at capacity while rejecting new sessions", async () => {
  const { acquire } = await import("@/server/limits");
  for (let i = 0; i < 1000; i++) acquire(`session-${i}`)();
  expect(() => acquire("new-session")).toThrow();
  expect(() => acquire("session-0")()).not.toThrow();
});

it("releases an active slot only once", async () => {
  vi.stubEnv("MAX_CONCURRENT_VERIFICATIONS", "1");
  const { acquire } = await import("@/server/limits");
  const release = acquire("first");
  expect(() => acquire("second")).toThrow();
  release();
  release();
  const releaseSecond = acquire("second");
  expect(() => acquire("third")).toThrow();
  releaseSecond();
});

it("expires session counts but retains the process-wide budget", async () => {
  vi.useFakeTimers();
  vi.stubEnv("MAX_LIVE_VERIFICATIONS", "11");
  const { acquire } = await import("@/server/limits");
  for (let i = 0; i < 10; i++) acquire("session")();
  expect(() => acquire("session")).toThrow();
  vi.advanceTimersByTime(600_000);
  acquire("session")();
  expect(() => acquire("other")).toThrow();
});
