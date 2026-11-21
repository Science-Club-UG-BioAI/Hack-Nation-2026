import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { handleVerification } from "@/server/handle-verification";
import { sessionAudit } from "@/server/audit-store";

vi.mock("@/server/providers", () => ({
  generate: async () => ({
    checkable: true,
    needsClarification: false,
    explanation: "Test",
    factCheckQueries: ["xx fixture"],
    queries: ["xx fixture", "yy fixture"],
  }),
}));
vi.mock("@/server/fact-check", () => ({ factCheck: async () => [] }));
vi.mock("@/server/corpus", () => ({
  corpus: async () => ({ hits: [], partial: false }),
}));
const send = async (
  session: string,
  claim: string,
  channel: "web" | "discord_demo" = "web",
) =>
  handleVerification(
    new NextRequest("http://localhost/api/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "prawdowid-session=" + session,
      },
      body: JSON.stringify(channel === "web" ? { claim } : { content: claim }),
    }),
    channel,
  );
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "fake");
  vi.stubEnv("GOOGLE_FACTCHECK_API_KEY", "fake");
  vi.stubEnv(
    "ALERT_WEBHOOK_URL",
    "https://recipient.example/incoming/private-token",
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each([204, 503, "offline"] as const)(
  "preserves the verdict and records delivery for %s",
  async (status) => {
    const webhook = vi.fn(async (_url: URL, _init: RequestInit) => {
      if (status === "offline") throw Error("Disconnected");
      return new Response(null, { status });
    });
    vi.stubGlobal("fetch", webhook);
    const session = randomUUID(),
      claim = "Ogłoszono alarm chemiczny na terenie miasta.";
    const response = await send(session, claim);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.verdict).toBe("insufficient");
    const [[url, init]] = webhook.mock.calls;
    expect(url.href).toBe(process.env.ALERT_WEBHOOK_URL);
    expect(init.redirect).toBe("error");
    expect(JSON.parse(String(init.body))).toEqual({
      requestId: result.requestId,
      reason: "high_risk",
    });
    expect(sessionAudit(session)[0].alert).toEqual({
      reason: "high_risk",
      status: status === 204 ? "delivered" : "failed",
      httpStatus: status === "offline" ? null : status,
    });
  },
);
it("alerts on a repeat in one session and ignores a channel mirror and unrelated sessions", async () => {
  const webhook = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", webhook);
  const session = randomUUID(),
    claim = "Podano nową masę próbki w porannym raporcie.";
  await send(session, claim);
  await send(session, claim, "discord_demo");
  await send(randomUUID(), claim);
  expect(webhook).not.toHaveBeenCalled();
  const replay = await send(session, claim);
  expect((await replay.json()).usage.cached).toBe(true);
  expect(webhook).toHaveBeenCalledTimes(1);
  expect(sessionAudit(session).at(-1)?.alert).toMatchObject({
    reason: "repeated_without_sources",
    status: "delivered",
  });
});
