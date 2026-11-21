import { afterEach, expect, it, vi } from "vitest";
import catalog from "../data/corpus/catalog.json";
import { getDomain } from "tldts";
import { corpus, searchCorpus } from "@/server/corpus";
afterEach(() => vi.unstubAllGlobals());
it("provides 100 unique audit records, 10 conservative domains and primary/secondary types", () => {
  expect(catalog.records.length).toBeGreaterThanOrEqual(100);
  expect(new Set(catalog.records.map((r) => r.url)).size).toBe(
    catalog.records.length,
  );
  expect(
    new Set(
      catalog.records.map((r) =>
        new URL(r.url).hostname.endsWith(".gov.pl")
          ? "gov.pl"
          : getDomain(r.url),
      ),
    ).size,
  ).toBeGreaterThanOrEqual(10);
  expect(catalog.records.some((r) => r.type === "official")).toBe(true);
  expect(catalog.records.some((r) => r.type === "encyclopedia")).toBe(true);
  for (const r of catalog.records) {
    expect(r.contentStored).toBe(false);
    expect(r.publisher).not.toBe("");
    expect(Date.parse(r.retrievedAt)).not.toBeNaN();
  }
});
it("retrieves only matched catalog URLs and never substitutes titles for unavailable evidence", async () => {
  const selected = searchCorpus("Poland NATO membership history");
  expect(selected.length).toBeGreaterThan(0);
  expect(selected.length).toBeLessThanOrEqual(3);
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("denied", { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await corpus(
      "Poland NATO membership history",
      new AbortController().signal,
    ),
  ).toEqual({ hits: [], partial: true });
  for (const [url, init] of fetcher.mock.calls) {
    expect(selected.some((r) => r.url === url)).toBe(true);
    expect(init.redirect).toBe("error");
  }
});
it("uses actual fetched text, declared metadata and corpus provenance", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          "<html><p>Poland joined NATO in 1999. This public article records the historical accession of Poland to the North Atlantic Treaty Organization.</p></html>",
          { headers: { "Content-Type": "text/html" } },
        ),
    ),
  );
  const result = await corpus(
    "Poland NATO membership history",
    new AbortController().signal,
  );
  expect(result.partial).toBe(false);
  expect(result.hits[0]).toMatchObject({
    provider: "corpus",
    contentScope: "text",
  });
  expect(result.hits[0].raw_content).toContain("joined NATO in 1999");
});
it("does not fetch user-supplied URLs or unrelated strings", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    await corpus(
      "http://127.0.0.1/private-secret-QX731",
      new AbortController().signal,
    ),
  ).toEqual({ hits: [], partial: false });
  expect(fetcher).not.toHaveBeenCalled();
});
