import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { generate, search } from "@/server/providers";
import { usageContext, summarizeUsage, type UsageCall } from "@/server/config";
import { critiqueSchema } from "@/server/evidence-graph";

const schema = z.object({ ok: z.boolean() });
const completed = () =>
  Response.json({
    status: "completed",
    steps: [
      {
        type: "thought",
        content: [{ type: "text", text: "Not part of the answer" }],
      },
      {
        type: "model_output",
        content: [{ type: "text", text: '{"ok":true}' }],
      },
    ],
  });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("retains successful searches with missing billing data as an unknown total", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ results: [], usage: { credits: 2 } }),
      )
      .mockResolvedValueOnce(Response.json({ results: [] })),
  );
  const calls: UsageCall[] = [];
  await usageContext.run(calls, async () => {
    await search("pierwsze pytanie", new AbortController().signal);
    await search("drugie pytanie", new AbortController().signal);
  });
  expect(calls.map((c) => c.costUsd)).toEqual([0.016, null]);
  expect(summarizeUsage(calls, false)).toEqual({
    inputTokens: 0,
    outputTokens: 0,
    searchCalls: 2,
    costUsd: null,
    cached: false,
  });
});
it("logs bounded schema diagnostics without provider text or input values", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        status: "incomplete",
        steps: [],
        error: "PRIVATE_PROVIDER_TEXT",
      }),
    ),
  );
  await expect(
    generate(
      schema,
      "instruction",
      { claim: "PRIVATE_CLAIM" },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
  const log = warning.mock.calls.map((call) => String(call[0])).join("\n");
  expect(log).toContain('"responseStatus":"incomplete"');
  expect(log).toContain('"path":"status"');
  expect(log).not.toMatch(/PRIVATE_PROVIDER_TEXT|PRIVATE_CLAIM/);
});

it("retries a transient 503 once without mixing thoughts into the answer", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(completed());
  vi.stubGlobal("fetch", fetcher);
  await expect(
    generate(schema, "Return JSON", {}, new AbortController().signal),
  ).resolves.toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not retry authentication errors", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("unauthorized", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    generate(schema, "Return JSON", {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "PROVIDER_AUTH_ERROR", retryable: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps the API key in headers and disables stored conversation state", async () => {
  vi.stubEnv("GEMINI_API_KEY", "private-test-key");
  const fetcher = vi.fn().mockResolvedValue(completed());
  vi.stubGlobal("fetch", fetcher);
  await generate(
    schema,
    "Return JSON",
    { claim: "A public claim" },
    new AbortController().signal,
  );
  const [url, options] = fetcher.mock.calls[0];
  expect(url).not.toContain("private-test-key");
  expect(options.body).not.toContain("private-test-key");
  expect(JSON.parse(options.body).store).toBe(false);
});
it("compacts the Gemini graph critic schema and keeps local response limits", async () => {
  const review = {
    targetId: "claim",
    decision: "ACCEPT",
    reason: "Sprawdzono.",
  };
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                reviews: Array(101).fill(review),
                repeats: [],
                limitations: [],
              }),
            },
          ],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    generate(critiqueSchema, "Review graph", {}, new AbortController().signal, {
      deadlineAt: Date.now() + 5_000,
      maxOutputTokens: 6500,
      compactResponseSchema: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
  const outgoing = JSON.parse(fetcher.mock.calls[0][1].body).response_format
    .schema;
  expect(outgoing.properties.reviews).toMatchObject({
    type: "array",
    items: {
      properties: {
        decision: { enum: expect.arrayContaining(["ACCEPT", "REJECT"]) },
      },
    },
  });
  expect(JSON.stringify(outgoing)).not.toMatch(/"maxItems"|"maxLength"/);
});

it("rejects a non-completed interaction even if it contains plausible JSON", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        status: "in_progress",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: '{"ok":true}' }],
          },
        ],
      }),
    ),
  );
  await expect(
    generate(schema, "Return JSON", {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
});

it.each([
  null,
  { status: "completed", steps: {} },
  { status: "completed", steps: [null] },
  { status: "completed", steps: [{ type: "model_output", content: {} }] },
  { status: "completed", steps: [{ type: "model_output", content: [null] }] },
  {
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "text", text: 42 }] }],
  },
])(
  "classifies malformed interaction envelopes as invalid model output: %j",
  async (body) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      generate(schema, "Return JSON", {}, new AbortController().signal),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("does not spend transport retries on invalid JSON from a successful response", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("not JSON"));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    generate(schema, "Return JSON", {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
