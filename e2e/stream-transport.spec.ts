import { expect, test } from "@playwright/test";

// Exercise Next's actual HTTP request adapter. Calling POST directly in Vitest
// does not reproduce the framework's request wrapper. Invalid input never calls AI.
test("real HTTP streaming preserves validation errors instead of NETWORK_ERROR", async ({
  request,
}) => {
  const session = await request.post("/api/session", {
    headers: { "x-prawdowid-action": "start-session" },
  });
  expect(session.ok()).toBe(true);
  const json = await request.post("/api/verify", { data: { claim: "   " } });
  expect(json.status()).toBe(400);
  expect(await json.json()).toMatchObject({ code: "INPUT_INVALID" });

  const streamed = await request.post("/api/verify", {
    headers: { accept: "text/event-stream" },
    data: { claim: "   " },
  });
  expect(streamed.headers()["content-type"]).toContain("text/event-stream");
  const frames = (await streamed.text()).trim().split("\n\n");
  expect(frames).toHaveLength(1);
  const event = JSON.parse(frames[0].slice(6));
  expect(event).toMatchObject({
    type: "error",
    error: {
      code: "INPUT_INVALID",
      status: "technical_error",
      retryable: false,
    },
  });
  expect(event.error.requestId).toMatch(/^[0-9a-f-]{36}$/i);
});

test("real HTTP streaming preserves origin checks without calling providers", async ({
  request,
}) => {
  await request.post("/api/session", {
    headers: { "x-prawdowid-action": "start-session" },
  });
  const response = await request.post("/api/verify", {
    headers: { accept: "text/event-stream", origin: "https://foreign.example" },
    data: { claim: "Polska przystąpiła do NATO 12 marca 1999 roku." },
  });
  const event = JSON.parse((await response.text()).trim().slice(6));
  expect(event).toMatchObject({
    type: "error",
    error: { code: "INPUT_INVALID" },
  });
  expect(event.error.message).toBe("Żądanie pochodzi z innej witryny.");
});

test("real HTTP streaming reaches the engine and returns its result without provider calls", async ({
  request,
}) => {
  const health = await (await request.get("/api/health")).json();
  await request.post("/api/session", {
    headers: { "x-prawdowid-action": "start-session" },
  });
  // A URL-only claim is accepted by input validation, but the engine handles it
  // locally as out of scope before planning or contacting any provider.
  const response = await request.post("/api/verify", {
    headers: { accept: "text/event-stream" },
    data: { claim: "https://example.com/stream-regression-check" },
  });
  const frames = (await response.text()).trim().split("\n\n");
  const last = JSON.parse(frames.at(-1)!.slice(6));
  expect(last).toMatchObject(
    health.providers.ready
      ? {
          type: "result",
          result: { status: "out_of_scope", verdict: null, evidence: [] },
        }
      : { type: "error", error: { code: "NOT_CONFIGURED" } },
  );
  await request.delete("/api/session", {
    headers: { "x-prawdowid-action": "delete-session" },
  });
});
