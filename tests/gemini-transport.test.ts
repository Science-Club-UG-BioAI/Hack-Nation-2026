import { afterEach, expect, it, vi } from "vitest";
import { geminiResponse } from "@/server/gemini-transport";

const run = (signal = new AbortController().signal) =>
  geminiResponse({ store: false, input: "A public test" }, signal);
const failed = (status: number, code: string, message = "Provider detail") =>
  Response.json({ error: { code, message } }, { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("switches only after one retry and sends the same payload to the explicit fallback", async () => {
  vi.stubEnv("GEMINI_MODEL", "gemini-3.1-flash-lite");
  vi.stubEnv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(failed(503, "service_unavailable"))
    .mockResolvedValueOnce(failed(503, "service_unavailable"))
    .mockResolvedValueOnce(Response.json({ status: "completed" }));
  vi.stubGlobal("fetch", fetcher);
  await expect(run()).resolves.toMatchObject({ status: "completed" });
  const payloads = fetcher.mock.calls.map(([, options]) =>
    JSON.parse(options.body),
  );
  expect(payloads.map((p) => p.model)).toEqual([
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
  ]);
  expect(
    payloads.every((p) => p.input === "A public test" && p.store === false),
  ).toBe(true);
});

it.each([
  [402, "payment_required", "PROVIDER_PAYMENT_REQUIRED"],
  [400, "failed_precondition", "PROVIDER_PAYMENT_REQUIRED"],
  [401, "authentication", "PROVIDER_AUTH_ERROR"],
  [403, "permission_denied", "PROVIDER_AUTH_ERROR"],
  [429, "quota_exceeded", "PROVIDER_QUOTA_EXCEEDED"],
  [400, "invalid_request", "PROVIDER_REQUEST_ERROR"],
])(
  "does not retry or change models for permanent error %s/%s",
  async (status, code, expected) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        failed(status, code, "billing credit sensitive-provider-detail"),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(run()).rejects.toMatchObject({
      code: expected,
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("recognizes legacy daily quota details instead of retrying", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json(
      {
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }],
        },
      },
      { status: 429 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(run()).rejects.toMatchObject({
    code: "PROVIDER_QUOTA_EXCEEDED",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("honors Retry-After without switching models for rate limits", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json(
        { error: { code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": "0" } },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(run()).rejects.toMatchObject({
    code: "PROVIDER_RATE_LIMITED",
    retryable: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    new Set(
      fetcher.mock.calls.map(([, options]) => JSON.parse(options.body).model),
    ).size,
  ).toBe(1);
});

it("returns long rate limits immediately instead of exceeding the demo deadline", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response("Rate limited", {
      status: 429,
      headers: { "Retry-After": "60" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(run()).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("bounds a complete outage to three HTTP calls", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => failed(503, "service_unavailable"));
  vi.stubGlobal("fetch", fetcher);
  await expect(run()).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("allows an operator to disable fallback", async () => {
  vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
  const fetcher = vi
    .fn()
    .mockImplementation(async () => failed(503, "service_unavailable"));
  vi.stubGlobal("fetch", fetcher);
  await expect(run()).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not continue retrying or falling back after cancellation", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn().mockImplementation(async () => {
    controller.abort();
    return failed(503, "service_unavailable");
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(run(controller.signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("reserves stage time for fallback after a stalled primary instead of repeating it", async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          );
        }),
    )
    .mockResolvedValueOnce(Response.json({ status: "completed" }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    geminiResponse({ input: "test" }, new AbortController().signal, {
      deadlineAt: Date.now() + 120,
    }),
  ).resolves.toMatchObject({ status: "completed" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const models = fetcher.mock.calls.map(
    ([, init]) => JSON.parse(init.body).model,
  );
  expect(models[0]).not.toBe(models[1]);
});

it("does not start an operation after its stage deadline", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    geminiResponse({}, new AbortController().signal, {
      deadlineAt: Date.now() - 1,
    }),
  ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  expect(fetcher).not.toHaveBeenCalled();
});
