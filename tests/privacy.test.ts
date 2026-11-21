import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { maskPersonalData } from "@/core/privacy";
import {
  writeAudit,
  sessionAudit,
  deleteSessionAudit,
  closeAuditStore,
} from "@/server/audit-store";
import { POST as verify } from "@/app/api/verify/route";
import { DELETE, GET } from "@/app/api/session/route";
import { generate, search } from "@/server/providers";
import { demoResult } from "@/core/demo";
vi.mock("@/server/providers", () => ({ generate: vi.fn(), search: vi.fn() }));
vi.mock("@/server/corpus", () => ({
  corpus: async () => ({ hits: [], partial: false }),
}));
const claim =
  "Raport pomiaru z 2025 roku: kontakt test@example.org, tel. +48 123 456 789, PESEL 12345678901.";
const plan = {
  checkable: true,
  needsClarification: false,
  clarificationKind: "missing_evidence",
  explanation: "Brak dowodu.",
  queries: ["raport pomiaru 2025", "raport pomiaru dokumentacja"],
};
const req = (session: string, method: string, body?: unknown) =>
  new NextRequest("http://localhost:3000/api/session", {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `prawdowid-session=${session}`,
      "x-prawdowid-action": "delete-session",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "fake");
  vi.stubEnv("TAVILY_API_KEY", "fake");
  vi.stubEnv("MAX_LIVE_VERIFICATIONS", "10000");
  vi.mocked(generate).mockResolvedValue(plan);
  vi.mocked(search).mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("masks obvious identifiers while preserving dates and substantive quantities", () => {
  const result = maskPersonalData(
    claim +
      " Rachunek PL61 1090 1014 0000 0712 1981 2874. Masa: 123 gramów; 12 marca 1999.",
  );
  expect(result.count).toBe(4);
  for (const raw of [
    "test@example.org",
    "123 456 789",
    "12345678901",
    "1090 1014",
  ])
    expect(result.text).not.toContain(raw);
  expect(result.text).toContain("2025");
  expect(result.text).toContain("12 marca 1999");
  expect(result.text).toContain("123 gramów");
  expect(maskPersonalData(result.text).count).toBe(0);
});
it("masks before model access and persistence, exports only the current session", async () => {
  const session = randomUUID();
  const response = await verify(req(session, "POST", { claim }));
  expect(response.status).toBe(200);
  const result = await response.json();
  const exported = await GET(req(session, "GET")).json();
  expect(exported.records).toHaveLength(1);
  expect(exported.records[0]).toMatchObject({
    status: "completed",
    verdict: "insufficient",
    channel: "web",
  });
  for (const payload of [
    result,
    exported,
    vi.mocked(generate).mock.calls,
    vi.mocked(search).mock.calls,
  ])
    expect(JSON.stringify(payload)).not.toContain("test@example.org");
  expect(await GET(req(randomUUID(), "GET")).json()).toMatchObject({
    records: [],
  });
  expect(result.limitations.join(" ")).toContain("zamaskowano");
});
it("survives a restart and expires records even after the process was stopped", () => {
  const session = randomUUID();
  writeAudit(session, {
    requestId: randomUUID(),
    channel: "web",
    claim,
    durationMs: 12,
    errorCode: "MODEL_UNAVAILABLE",
  });
  closeAuditStore();
  expect(sessionAudit(session)).toHaveLength(1);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
  closeAuditStore();
  expect(sessionAudit(session)).toEqual([]);
});
it("deletes only the current session and prevents late writes and cookie replay", async () => {
  const own = randomUUID(),
    other = randomUUID();
  await verify(req(own, "POST", { claim }));
  await verify(
    req(other, "POST", {
      claim: "Inny raport z 2025 roku podaje masę próbki 4 gramy.",
    }),
  );
  const deleted = DELETE(req(own, "DELETE"));
  expect(deleted.status).toBe(200);
  expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(GET(req(own, "GET")).status).toBe(409);
  expect(sessionAudit(other)).toHaveLength(1);
  const late = await verify(req(own, "POST", { claim }));
  expect(late.status).toBe(409);
  expect(late.headers.get("set-cookie")).toBeNull();
  expect(() =>
    writeAudit(own, {
      requestId: randomUUID(),
      channel: "web",
      claim,
      durationMs: 2,
    }),
  ).toThrow();
});
it("cancels an in-flight check without recreating deleted audit data or cookies", async () => {
  const session = randomUUID();
  let release!: (value: unknown) => void, started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.mocked(generate).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
        started();
      }),
  );
  const pending = verify(req(session, "POST", { claim }));
  await waiting;
  expect(DELETE(req(session, "DELETE")).status).toBe(200);
  release(plan);
  const response = await pending;
  expect(response.status).toBe(409);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(GET(req(session, "GET")).status).toBe(409);
});
it("rejects cross-site deletion and requests without the action header", () => {
  const request = req(randomUUID(), "DELETE");
  request.headers.set("origin", "https://attacker.example");
  expect(DELETE(request).status).toBe(403);
  request.headers.delete("origin");
  request.headers.delete("x-prawdowid-action");
  expect(DELETE(request).status).toBe(403);
});
it("does not leave removed input text in SQLite free pages", () => {
  const session = randomUUID();
  const marker = "unique audit content for secure deletion check";
  writeAudit(session, {
    requestId: randomUUID(),
    channel: "web",
    claim: marker,
    durationMs: 1,
  });
  deleteSessionAudit(session);
  closeAuditStore();
  expect(
    readFileSync(process.env.AUDIT_DB_PATH!).includes(Buffer.from(marker)),
  ).toBe(false);
});

it("does not persist source quotations, credentials, tracking or encoded contact information", () => {
  const session = randomUUID();
  const result = structuredClone(demoResult("nato")!);
  result.sources[0].url =
    "https://user:password@example.org/contact/test%40example.org?token=secret&oldid=123";
  writeAudit(session, {
    requestId: randomUUID(),
    channel: "web",
    claim,
    durationMs: 1,
    result,
  });
  const record = sessionAudit(session)[0];
  const json = JSON.stringify(record);
  expect(json).not.toContain("password");
  expect(json).not.toContain("token");
  expect(json).not.toContain("test%40example.org");
  expect(json).not.toContain("test@example.org");
  expect(json).toContain("oldid=123");
  expect(record.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        quoteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]),
  );
  expect(record.evidence).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ quote: expect.any(String) }),
    ]),
  );
});

it("refuses provider access when the audit database cannot be opened", async () => {
  // A directory cannot be opened as a SQLite database. No file permissions or
  // real user database need to be changed to exercise the failure path.
  const { dirname } = await import("node:path");
  const previous = process.env.AUDIT_DB_PATH!;
  vi.stubEnv("AUDIT_DB_PATH", dirname(previous));
  const response = await verify(req(randomUUID(), "POST", { claim }));
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe("AUDIT_UNAVAILABLE");
  expect(body).not.toHaveProperty("verdict");
  expect(JSON.stringify(body)).not.toContain(previous);
  expect(generate).not.toHaveBeenCalled();
});
