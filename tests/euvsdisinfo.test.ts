import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { euvsdisinfo, euvsdisinfoConfigured } from "@/server/euvsdisinfo";

const signal = () => new AbortController().signal;
const KEY = "test-euvsdisinfo-key";

type Item = { type: string; title: string; content: string; link: string };

function rpc(results: Item[], extra: Record<string, unknown> = {}) {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [{ type: "text", text: "ignored markdown" }],
      structuredContent: { results },
      ...extra,
    },
  };
}

function sse(payload: unknown) {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

const review: Item = {
  type: "claim_review",
  title: "Poland plans to swallow Ukraine",
  content:
    "<h3>SUMMARY</h3><p>Poland will annex western Ukraine.</p><h3>RESPONSE</h3><p>No evidence supports this claim.</p>",
  link: "https://euvsdisinfo.eu/report/poland-plans-to-swallow-ukraine",
};
const article: Item = {
  type: "article",
  title: "Figure of the Week: 5",
  content: "<p>Polish authorities issue entry bans.</p><script>x</script>",
  link: "https://euvsdisinfo.eu/figure-of-the-week-5/",
};

beforeEach(() => {
  vi.stubEnv("EUVSDISINFO_API_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EUvsDisinfo adapter", () => {
  it("reports configuration from the environment", () => {
    expect(euvsdisinfoConfigured()).toBe(true);
    vi.stubEnv("EUVSDISINFO_API_KEY", "  ");
    expect(euvsdisinfoConfigured()).toBe(false);
  });

  it("sends a stateless MCP search call with the key in a header", async () => {
    const fetcher = vi.fn().mockResolvedValue(sse(rpc([review])));
    vi.stubGlobal("fetch", fetcher);
    await euvsdisinfo("  Poland Ukraine  ", signal(), {
      from: "2024-01-01",
      to: "2024-12-31",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://mcp.euvsd.info/mcp");
    expect(String(url)).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers["X-API-Key"]).toBe(KEY);
    expect(init.headers.Accept).toBe("application/json, text/event-stream");
    expect(init.headers["mcp-session-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(init.body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "search",
        arguments: {
          query: "Poland Ukraine",
          date_from: "2024-01-01",
          date_to: "2024-12-31",
        },
      },
    });
  });

  it("omits date filters when not given", async () => {
    const fetcher = vi.fn().mockResolvedValue(sse(rpc([])));
    vi.stubGlobal("fetch", fetcher);
    await euvsdisinfo("biolab", signal());
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params.arguments).toEqual({
      query: "biolab",
    });
  });

  it("maps claim reviews and articles to hits with plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sse(rpc([review, article]))),
    );
    const { hits, partial } = await euvsdisinfo("Poland", signal());
    expect(partial).toBe(false);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      title: review.title,
      url: review.link,
      canonicalUrl: review.link,
      provider: "euvsdisinfo",
      sourceType: "official",
      contentScope: "text",
      publisherGroup: "euvsdisinfo.eu",
    });
    expect(hits[0].raw_content).toContain("SUMMARY");
    expect(hits[0].raw_content).toContain("No evidence supports this claim.");
    expect(hits[0].raw_content).not.toContain("<");
    expect(hits[0].notes?.[0]).toContain("NIE fakt");
    expect(hits[1].raw_content).toBe("Polish authorities issue entry bans.");
    expect(hits[1].notes?.[0]).toContain("Artykuł analityczny");
  });

  it("parses a plain JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(rpc([article]))),
    );
    const { hits } = await euvsdisinfo("Poland", signal());
    expect(hits[0].url).toBe(article.link);
  });

  it("returns at most 3 hits", async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...article,
      title: `A${i}`,
      link: `https://euvsdisinfo.eu/a-${i}/`,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse(rpc(many))));
    const { hits } = await euvsdisinfo("Poland", signal());
    expect(hits.map((h) => h.title)).toEqual(["A0", "A1", "A2"]);
  });

  it("returns no hits without a structured result", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sse({ jsonrpc: "2.0", id: 1, result: { content: [] } }),
        ),
    );
    expect(await euvsdisinfo("Poland", signal())).toEqual({
      hits: [],
      partial: false,
    });
  });

  it("skips the network for queries shorter than 3 characters", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await euvsdisinfo(" ab ", signal())).toEqual({
      hits: [],
      partial: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails without an API key and does not call the network", async () => {
    vi.stubEnv("EUVSDISINFO_API_KEY", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow(
      "EUVSDISINFO_API_KEY",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    );
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow("HTTP 401");
  });

  it("fails on JSON-RPC errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sse({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "date_from > date_to" },
        }),
      ),
    );
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow(
      "date_from > date_to",
    );
  });

  it("fails on tool-level errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sse(rpc([], { isError: true }))),
    );
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow("tool error");
  });

  it("fails on an empty event stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("event: message\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow(
      "Empty EUvsDisinfo response",
    );
  });

  it.each([
    "https://evil.example/report/x",
    "http://euvsdisinfo.eu/report/x",
    "https://euvsdisinfo.eu.evil.example/x",
  ])("rejects untrusted result link %s", async (link) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sse(rpc([{ ...article, link }]))),
    );
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow(
      "Unexpected EUvsDisinfo link",
    );
  });

  it("rejects malformed result items", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(sse(rpc([{ ...article, type: "video" } as Item]))),
    );
    await expect(euvsdisinfo("Poland", signal())).rejects.toThrow();
  });

  it("stops when the request is aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        init.signal?.throwIfAborted();
        return Promise.resolve(sse(rpc([article])));
      }),
    );
    await expect(euvsdisinfo("Poland", controller.signal)).rejects.toThrow(
      "cancelled",
    );
  });
});

describe.skipIf(
  process.env.RUN_SOURCE_LIVE_TESTS !== "1" ||
    !process.env.EUVSDISINFO_API_KEY?.trim(),
)("opt-in EUvsDisinfo integration", () => {
  it("retrieves real EUvsDisinfo material", async () => {
    vi.unstubAllEnvs();
    const { hits } = await euvsdisinfo(
      "Poland Ukraine refugees",
      AbortSignal.timeout(20_000),
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.url).toMatch(/^https:\/\/euvsdisinfo\.eu\//);
      expect(hit.raw_content!.length).toBeGreaterThan(40);
    }
  }, 25_000);
});
