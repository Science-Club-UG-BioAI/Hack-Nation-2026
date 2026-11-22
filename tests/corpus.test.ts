import { afterEach, expect, it, vi } from "vitest";
import catalog from "../data/corpus/catalog.json";
import { getDomain } from "tldts";
import { corpus, searchCorpus } from "@/server/corpus";
import {
  isAllowedCorpusUrl,
  isFactCheckingArticle,
} from "@/core/source-policy";
// @ts-expect-error The standalone .mjs CLI has no TypeScript declaration.
import { corpusStats } from "../scripts/check-corpus.mjs";
afterEach(() => vi.unstubAllGlobals());
it("does not report brief compliance for a corpus with only one source type", () => {
  const oneType = {
    records: catalog.records.map((record) => ({ ...record, type: "official" })),
  };
  expect(corpusStats(oneType).failures).toContain(
    "Fewer than 2 source types (brief requirement)",
  );
  const twoTypes = {
    records: oneType.records.map((record, index) => ({
      ...record,
      type: index === 0 ? "fact_check" : "official",
    })),
  };
  expect(corpusStats(twoTypes).failures).not.toContain(
    "Fewer than 2 source types (brief requirement)",
  );
});
it("provides 100 unique audit records, 10 conservative domains and two source types with the agreed exclusions", () => {
  expect(corpusStats(catalog).failures).toEqual([]);
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
  const factChecks = catalog.records.filter((r) => r.type === "fact_check");
  expect(factChecks.length).toBeGreaterThanOrEqual(3);
  for (const record of factChecks) {
    expect(isAllowedCorpusUrl(record.url)).toBe(true);
    expect(isFactCheckingArticle(record.url)).toBe(true);
  }
  expect(
    catalog.records.some((r) =>
      ["wikipedia.org", "pap.pl"].includes(getDomain(r.url) ?? ""),
    ),
  ).toBe(false);
  for (const r of catalog.records) {
    expect(r.contentStored).toBe(false);
    expect(r.publisher).not.toBe("");
    expect(Date.parse(r.retrievedAt)).not.toBeNaN();
  }
});
it("retrieves catalogued fact checks as fetched text with their publication metadata", async () => {
  const record = catalog.records.find((r) => r.type === "fact_check")!;
  expect(searchCorpus(record.title).map((r) => r.id)).toContain(record.id);
  const text =
    "Kontrolowana treść pobranego artykułu do testu adaptera korpusu. Jest wystarczająco długa, aby stanowić materiał do analizy, i różni się od tytułu katalogowego.";
  const fetcher = vi.fn(
    async () =>
      new Response(`<html><main><p>${text}</p></main></html>`, {
        headers: { "Content-Type": "text/html" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await corpus(record.title, new AbortController().signal);
  expect(result.partial).toBe(false);
  expect(result.hits.find((hit) => hit.url === record.url)).toMatchObject({
    raw_content: text,
    published_date: record.publishedAt,
    updatedAt: record.updatedAt,
    publisher: "Stowarzyszenie Demagog",
    publisherIsDomain: false,
    provider: "corpus",
    sourceType: "web",
    contentScope: "text",
  });
  expect(fetcher).toHaveBeenCalledWith(
    record.url,
    expect.objectContaining({ redirect: "error", cache: "no-store" }),
  );
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
    publisher: searchCorpus("Poland NATO membership history")[0].publisher,
    publisherIsDomain: false,
  });
  expect(result.hits[0].raw_content).toContain("joined NATO in 1999");
});
it("keeps evidence for event and update dates distinct from collection time", () => {
  const kprm = catalog.records.find((r) => r.id === "7adfcc962290a959");
  expect(kprm).toMatchObject({
    publishedAt: "2024-03-12",
    eventPeriod: { from: "1999-03-12", to: "1999-03-12" },
    updatedAt: null,
  });
  expect(
    catalog.records.find((r) => r.id === "e1b4835ca4338553")?.updatedAt,
  ).toBe("2023-05-03T17:54:00Z");
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
