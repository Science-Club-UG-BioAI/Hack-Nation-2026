import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/vision/route";
import { MAX_IMAGE_BYTES } from "@/core/vision";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64",
);
const fetcher = vi.fn<typeof fetch>();

function upload(bytes = png, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://localhost/api/vision", {
      method: "POST",
      body: new Uint8Array(bytes),
      headers: {
        "content-type": "image/png",
        cookie: "prawdowid-session=" + crypto.randomUUID(),
        ...headers,
      },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("GEMINI_MODEL", "configured-model");
  vi.stubEnv("TAVILY_API_KEY", "");
  vi.stubGlobal("fetch", fetcher.mockReset());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function modelReply(result: unknown) {
  return Response.json({
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(result) }],
      },
    ],
  });
}

it("uses the configured Gemini model with inline image bytes and permits a description without a claim", async () => {
  const result = { description: "Jednolite jasne tło.", suggestedClaim: null };
  fetcher.mockResolvedValueOnce(modelReply(result));
  const response = await upload();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(result);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  );
  expect(JSON.parse(String(init?.body))).toMatchObject({
    store: false,
    model: "configured-model",
    input: [
      { type: "text" },
      { type: "image", mime_type: "image/png", data: png.toString("base64") },
    ],
  });
});

it.each([
  ["unsupported format", png, { "content-type": "image/svg+xml" }, 415],
  ["mislabeled file", png, { "content-type": "image/jpeg" }, 415],
  ["empty file", Buffer.alloc(0), {}, 415],
  [
    "declared size",
    png,
    { "content-length": String(MAX_IMAGE_BYTES + 1) },
    413,
  ],
  ["actual size", Buffer.alloc(MAX_IMAGE_BYTES + 1), {}, 413],
  ["foreign origin", png, { origin: "https://example.org" }, 403],
  ["missing session", png, { cookie: "" }, 400],
] as [string, Buffer<ArrayBuffer>, Record<string, string>, number][])(
  "rejects %s before contacting Gemini",
  async (_, bytes, headers, status) => {
    expect((await upload(bytes, headers)).status).toBe(status);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("rejects malformed model output instead of presenting it as an image description", async () => {
  fetcher.mockResolvedValueOnce(
    modelReply({ description: "", suggestedClaim: "?" }),
  );
  const response = await upload();
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
});
