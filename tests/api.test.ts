vi.mock("@/server/corpus", () => ({
  corpus: async () => ({ hits: [], partial: false }),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/verify/route";
import { GET } from "@/app/api/health/route";
import {
  readVerificationStream,
  type VerificationEvent,
} from "@/core/progress";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { sessionAudit } from "@/server/audit-store";

const claim = "Polska przystąpiła do NATO 12 marca 1999 roku.";
const quote = "Poland joined NATO on 12 March 1999.";
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const geminiResponse = (value: unknown) =>
  Response.json({
    status: "completed",
    usage: {
      total_input_tokens: 100,
      total_cached_tokens: 10,
      total_output_tokens: 20,
      total_thought_tokens: 5,
    },
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(value) }],
      },
    ],
  });

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
  vi.stubEnv("TAVILY_API_KEY", "test-key-not-real");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.1-flash-lite");
  vi.stubEnv("MAX_LIVE_VERIFICATIONS", "10000");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("real route and adapters with controlled HTTP provider responses", () => {
  it.each(["json", "stream"])(
    "completes the entire %s path and keeps keys server-side",
    async (transport) => {
      let modelCalls = 0;
      const fetcher = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          expect(init?.signal).toBeTruthy();
          if (String(url).includes("tavily"))
            return Response.json({
              usage: { credits: 2 },
              results: [
                {
                  title: "CONTEXT_ONLY",
                  url: "https://www.bbc.com/context",
                  content: "Context for search planning.",
                  raw_content:
                    "CONTEXT_ONLY description of the event with enough text for an evidence document.",
                },
                {
                  title: "NATO",
                  published_date: "1999-03-12",
                  url: "https://demagog.org.pl/source",
                  raw_content: quote + " More relevant historical context.",
                },
                {
                  title: "Official",
                  published_date: "1999-03-12",
                  url: "https://gov.pl/nato",
                  raw_content: quote + " Official membership record.",
                },
              ],
            });
          if (modelCalls === 0)
            expect(String(init?.body)).toContain("CONTEXT_ONLY");
          else expect(String(init?.body)).not.toContain("CONTEXT_ONLY");
          modelCalls++;
          if (modelCalls === 1)
            return geminiResponse({
              checkable: true,
              needsClarification: false,
              explanation: "Sprawdzalna data.",
              queries: ["Poland NATO date", "Poland NATO alternative date"],
            });
          if (modelCalls === 2)
            return geminiResponse({
              verdict: "supported",
              proofGaps: [],
              findings: [{ id: "f1", text: claim, quoteIds: ["q1", "q2"] }],
              basis: {
                kind: "confirmed",
                establishedPremise: "",
                inferenceOrCorrection: "Date matches",
                premiseQuoteIds: [],
                decisiveQuoteIds: ["q1", "q2"],
              },
              explanation: "Źródło potwierdza datę.",
              limitations: [],
              evidence: [
                {
                  quoteId: "q1",
                  scope: "direct",
                  relation: "supports",
                  relevance: "Właściwa data.",
                },
                {
                  quoteId: "q2",
                  scope: "direct",
                  relation: "supports",
                  relevance: "Drugie źródło potwierdza datę.",
                },
              ],
            });
          return geminiResponse({
            approved: true,
            findingChecks: [{ findingId: "f1", supported: true, atomic: true }],
            reason: "Zgodne z dowodem.",
          });
        },
      );
      vi.stubGlobal("fetch", fetcher);
      const session = randomUUID();
      const response = await POST(
        request(
          { claim },
          {
            cookie: `prawdowid-session=${session}`,
            ...(transport === "stream" && { accept: "text/event-stream" }),
          },
        ),
      );
      expect(response.status).toBe(200);
      const events: VerificationEvent[] = [];
      let body;
      if (transport === "stream") {
        await readVerificationStream(response.body!, (event) =>
          events.push(event),
        );
        expect(
          events.filter((e) => e.type === "stage").map((e) => e.stage),
        ).toEqual(["planning", "searching", "assessing", "auditing"]);
        expect(
          events.some(
            (e) => e.type === "source" && e.source.status === "running",
          ),
        ).toBe(true);
        expect(
          events.some(
            (e) =>
              e.type === "source" &&
              e.source.provider === "web" &&
              e.source.status === "ok",
          ),
        ).toBe(true);
        const last = events.at(-1);
        expect(last?.type).toBe("result");
        body = last?.type === "result" ? last.result : null;
      } else body = await response.json();
      expect(body.verdict).toBe("supported");
      const queries = fetcher.mock.calls
        .filter(([url]) => String(url).includes("tavily"))
        .map(([, init]) => JSON.parse(String(init?.body)));
      expect(queries[0].include_domains).toBeUndefined();
      expect(queries[0].query).not.toContain("site:");
      for (const request of queries.slice(1)) {
        expect(request.include_domains).toHaveLength(1);
        expect(["demagog.org.pl", "euvsdisinfo.eu", "gov.pl"]).toContain(
          request.include_domains[0],
        );
        for (const domain of request.include_domains)
          expect(request.query).toContain("site:" + domain);
        expect(request.query).not.toContain("(site:");
      }
      expect(queries.slice(1, 4).map((request) => request.query)).toEqual([
        `${claim} site:demagog.org.pl`,
        `${claim} site:euvsdisinfo.eu`,
        `${claim} site:gov.pl`,
      ]);
      expect(JSON.stringify(body.sources)).not.toContain("bbc.com");
      expect(body.mode).toBe("live");
      expect(body.usage).toMatchObject({
        inputTokens: 300,
        outputTokens: 75,
        searchCalls: 7,
        cached: false,
      });
      expect(body.usage.costUsd).toBeCloseTo(0.11218075, 10);
      expect(body.strength.independentGroups).toBe(2);
      const row = sessionAudit(session)[0];
      expect(row.usage).toEqual(body.usage);
      expect(row.usageCalls).toHaveLength(10);
      const db = new DatabaseSync(process.env.AUDIT_DB_PATH!, {
        readOnly: true,
      });
      try {
        expect(
          JSON.parse(
            String(
              db
                .prepare("SELECT usage FROM checks WHERE id=?")
                .get(body.requestId)?.usage,
            ),
          ),
        ).toEqual(body.usage);
      } finally {
        db.close();
      }
      expect(body.citationContract).toBe("findings-v1");
      expect(body.findings).toEqual([
        { id: "f1", text: claim, evidenceIds: ["q1", "q2"] },
      ]);
      expect(body.explanation).toBe(`${claim} [1] [2]`);
      expect(fetcher).toHaveBeenCalledTimes(10);
      expect(JSON.stringify(body)).not.toContain("test-key-not-real");
      expect(response.headers.get("cache-control")).toContain("no-store");
    },
  );
  it("streams failures without a verdict and preserves origin validation", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(
      request(
        { claim },
        {
          accept: "text/event-stream",
          cookie: `prawdowid-session=${randomUUID()}`,
          origin: "https://attacker.example",
        },
      ),
    );
    const events: VerificationEvent[] = [];
    await readVerificationStream(response.body!, (event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      error: { code: "INPUT_INVALID" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("delivers a stage before the provider resolves and aborts work on disconnect", async () => {
    let providerAborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              "abort",
              () => {
                providerAborted = true;
                reject(init.signal.reason);
              },
              { once: true },
            );
          }),
      ),
    );
    const response = await POST(
      request(
        { claim },
        {
          accept: "text/event-stream",
          cookie: `prawdowid-session=${randomUUID()}`,
        },
      ),
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(
      '"stage":"planning"',
    );
    await reader.cancel();
    await vi.waitFor(() => expect(providerAborted).toBe(true));
  });
  it("rejects invalid input before accessing providers", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request({ claim: "short" }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a browser-marked cross-site request without an Origin header", async () => {
    const response = await POST(
      request({ claim }, { "sec-fetch-site": "cross-site" }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INPUT_INVALID" });
  });
  it("rejects a cross-origin request", async () =>
    expect(
      (await POST(request({ claim }, { origin: "https://attacker.example" })))
        .status,
    ).toBe(403));
  it("accepts the browser host when Next normalizes the loopback URL", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(
      request(
        { claim },
        { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
      ),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("NOT_CONFIGURED");
  });
  it("rejects oversized bodies", async () =>
    expect((await POST(request({ claim: "a".repeat(9000) }))).status).toBe(
      400,
    ));
  it.each(["application/json-invalid", "text/plain; type=application/json"])(
    "rejects a misleading content type: %s",
    async (contentType) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      expect(
        (await POST(request({ claim }, { "content-type": contentType })))
          .status,
      ).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("applies the deadline to a stalled request body before calling providers", async () => {
    vi.stubEnv("VERIFY_TIMEOUT_MS", "20");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half" as const,
    };
    const response = await POST(
      new NextRequest("http://localhost:3000/api/verify", init),
    );
    expect(response.status).toBe(504);
    expect((await response.json()).code).toBe("VERIFICATION_TIMEOUT");
    expect(fetcher).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });
  it("reports missing configuration without returning demo data", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(request({ claim }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.code).toBe("NOT_CONFIGURED");
    expect(body).not.toHaveProperty("verdict");
  });
  it("does not leak provider error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("sensitive-provider-message", { status: 401 }),
      ),
    );
    const response = await POST(request({ claim }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.code).toBe("PROVIDER_AUTH_ERROR");
    expect(JSON.stringify(body)).not.toContain("sensitive");
    expect(body).not.toHaveProperty("verdict");
  });
  it("aborts a stalled provider within the shared deadline", async () => {
    vi.stubEnv("VERIFY_TIMEOUT_MS", "20");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            ),
          ),
      ),
    );
    const response = await POST(request({ claim }));
    expect(response.status).toBe(504);
    expect((await response.json()).code).toBe("VERIFICATION_TIMEOUT");
  });
  it("health exposes readiness, never credentials", async () => {
    const body = await GET().json();
    expect(body.providers.ready).toBe(true);
    expect(JSON.stringify(body)).not.toContain("test-key-not-real");
  });
});
