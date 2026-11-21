import { expect, it } from "vitest";
import { quotationCatalog, resolveSelection } from "@/core/quotations";
import type { Document } from "@/core/contracts";

const text =
  "Polska **przystąpiła do NATO** 12 marca 1999 r.\n\nŹródło: [dokument](https://example.org).";
const docs: Document[] = [
  {
    id: "s1",
    title: "Record",
    url: "https://example.org",
    publishedAt: null,
    retrievedAt: "2026-11-21",
    chunks: [{ id: "s1:p3", text }],
  },
];
const selected = {
  verdict: "supported",
  explanation: "Data w dokumencie.",
  limitations: [],
  evidence: [
    { quoteId: "q1", relation: "supports", relevance: "Data członkostwa." },
  ],
};

it("materializes exact punctuation, Markdown and source IDs without model transcription", () => {
  const catalog = quotationCatalog(docs);
  const result = resolveSelection(selected, catalog, docs);
  expect(result.evidence[0]).toMatchObject({
    quote: text,
    sourceId: "s1",
    chunkId: "s1:p3",
  });
});
it("cannot replace the quote text with text supplied by the model", () => {
  const result = resolveSelection(
    {
      ...selected,
      evidence: [
        {
          ...selected.evidence[0],
          quote: "An invented claim",
          sourceId: "invented",
        },
      ],
    },
    quotationCatalog(docs),
    docs,
  );
  expect(result.evidence[0].quote).toBe(text);
  expect(result.evidence[0].sourceId).toBe("s1");
});
it("rejects nonexistent and duplicate quote selections", () => {
  const catalog = quotationCatalog(docs);
  expect(() =>
    resolveSelection(
      { ...selected, evidence: [{ ...selected.evidence[0], quoteId: "q999" }] },
      catalog,
      docs,
    ),
  ).toThrow();
  expect(() =>
    resolveSelection(
      { ...selected, evidence: [selected.evidence[0], selected.evidence[0]] },
      catalog,
      docs,
    ),
  ).toThrow();
});
it("still runs strict quote validation after resolving a selection", () => {
  const catalog = quotationCatalog(docs);
  catalog.quotes.get("q1")!.quote =
    "This passage does not exist in the source.";
  expect(() => resolveSelection(selected, catalog, docs)).toThrow();
});
it("bounds passages and preserves substrings for long text and long sentences", () => {
  const long = `${"Zdanie z polską interpunkcją. ".repeat(60)}${"ciągły tekst bez końca ".repeat(100)}`;
  const source = [{ ...docs[0], chunks: [{ id: "s1:p0", text: long }] }];
  const catalog = quotationCatalog(source);
  expect(catalog.quotes.size).toBeGreaterThan(2);
  for (const quote of catalog.quotes.values()) {
    expect(quote.quote.length).toBeLessThanOrEqual(650);
    expect(quote.quote.length).toBeGreaterThanOrEqual(12);
    expect(long.includes(quote.quote)).toBe(true);
  }
});
