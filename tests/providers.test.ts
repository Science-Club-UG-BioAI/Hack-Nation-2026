import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { generate } from "@/server/providers";

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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
