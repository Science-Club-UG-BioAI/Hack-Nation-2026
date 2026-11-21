import { expect, it } from "vitest";
import {
  quotationCatalog,
  resolveSelection,
  reasonedSelectionSchema,
} from "@/core/quotations";
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

const publication = {
  ...selected,
  findings: [
    {
      id: "f1",
      text: "Polska przystąpiła do NATO 12 marca 1999 roku.",
      quoteIds: ["q1"],
    },
  ],
};
it("publishes only evidence-linked findings, never free-form model prose", () => {
  const result = resolveSelection(
    {
      ...publication,
      explanation: "UNCITED fact in explanation",
      limitations: ["UNCITED fact in caveat"],
      evidence: [
        { ...selected.evidence[0], relevance: "UNCITED fact in relevance" },
      ],
    },
    quotationCatalog(docs),
    docs,
    true,
  );
  expect(result.findings).toEqual([
    { id: "f1", text: publication.findings[0].text, evidenceIds: ["q1"] },
  ]);
  expect(result.explanation).toBe(`${publication.findings[0].text} [1]`);
  expect(result.evidence[0].id).toBe("q1");
  expect(JSON.stringify(result)).not.toContain("UNCITED");
});
it.each(
  [
    undefined,
    [],
    [{ id: "f1", text: "An unsupported fact.", quoteIds: [] }],
    [{ id: "f1", text: "An unsupported fact.", quoteIds: ["q999"] }],
    [{ id: "f1", text: "A fact.", quoteIds: ["q1", "q1"] }],
    [
      publication.findings[0],
      { id: "f1", text: "Another fact.", quoteIds: ["q1"] },
    ],
    [publication.findings[0], { ...publication.findings[0], id: "f2" }],
  ].map((findings) => ({ findings })),
)(
  "rejects missing, empty, dangling and duplicated publication mappings: %j",
  ({ findings }) => {
    expect(() =>
      resolveSelection(
        { ...publication, findings },
        quotationCatalog(docs),
        docs,
        true,
      ),
    ).toThrow();
  },
);
it("materializes a quotation explicitly selected by a finding, without inventing its relation", () => {
  const extra = {
    ...docs[0],
    id: "s2",
    chunks: [{ id: "s2:p0", text: "An unrelated event happened in 2004." }],
  };
  const documents = [...docs, extra];
  const result = resolveSelection(
    {
      ...publication,
      findings: [{ ...publication.findings[0], quoteIds: ["q2"] }],
    },
    quotationCatalog(documents),
    documents,
    true,
  );
  expect(result.evidence[1]).toMatchObject({
    id: "q2",
    quote: extra.chunks[0].text,
    relation: "context",
  });
  expect(result.findings?.[0].evidenceIds).toEqual(["q2"]);
});
it("allows multiple distinct findings to share a quotation without merging their identities", () => {
  const result = resolveSelection(
    {
      ...publication,
      findings: [
        publication.findings[0],
        {
          id: "f2",
          text: "Drugie ustalenie wymagające osobnego audytu znaczenia.",
          quoteIds: ["q1"],
        },
      ],
    },
    quotationCatalog(docs),
    docs,
    true,
  );
  expect(result.findings).toHaveLength(2);
  expect(result.explanation.match(/\[1\]/g)).toHaveLength(2);
});
it("preserves all selected references and the whole finding for semantic audit", () => {
  const documents = [
    ...docs,
    {
      ...docs[0],
      id: "s2",
      chunks: [
        {
          id: "s2:p0",
          text: "An additional historical record with another date.",
        },
      ],
    },
  ];
  const result = resolveSelection(
    {
      ...publication,
      findings: [{ ...publication.findings[0], quoteIds: ["q1", "q2"] }],
    },
    quotationCatalog(documents),
    documents,
    true,
  );
  expect(result.findings).toEqual([
    { id: "f1", text: publication.findings[0].text, evidenceIds: ["q1", "q2"] },
  ]);
  expect(result.evidence).toHaveLength(2);
  expect(result.explanation).toBe(`${publication.findings[0].text} [1] [2]`);
  expect(() =>
    resolveSelection(
      {
        ...publication,
        findings: [{ ...publication.findings[0], quoteIds: ["q1", "q999"] }],
      },
      quotationCatalog(documents),
      documents,
      true,
    ),
  ).toThrow();
});
it("never promotes finding references to direct support without an explicit relation", () => {
  expect(() =>
    resolveSelection(
      { ...publication, evidence: [] },
      quotationCatalog(docs),
      docs,
      true,
    ),
  ).toThrow();
});
it("bounds the union of explicit and finding selections, including references selected only once", () => {
  const documents = Array.from({ length: 11 }, (_, i) => ({
    ...docs[0],
    id: `s${i + 1}`,
    chunks: [
      {
        id: `s${i + 1}:p0`,
        text: `Distinct evidence passage number ${i + 1} describing a historical event.`,
      },
    ],
  }));
  const catalog = quotationCatalog(documents);
  expect(() =>
    resolveSelection(
      {
        ...publication,
        findings: [
          {
            id: "f1",
            text: "First assertion.",
            quoteIds: [...catalog.quotes.keys()].slice(0, 6),
          },
          {
            id: "f2",
            text: "Second assertion.",
            quoteIds: [...catalog.quotes.keys()].slice(6),
          },
        ],
      },
      catalog,
      documents,
      true,
    ),
  ).toThrow();
});
it("does not turn invented citations in an unresolved response into successful abstention", () => {
  expect(() =>
    resolveSelection(
      {
        ...selected,
        findings: [],
        evidence: [{ ...selected.evidence[0], quoteId: "invented" }],
        basis: {
          kind: "unresolved",
          establishedPremise: "",
          inferenceOrCorrection: "",
          premiseQuoteIds: [],
          decisiveQuoteIds: [],
        },
      },
      quotationCatalog(docs),
      docs,
      true,
    ),
  ).toThrow();
});
it("does not require factual prose for an unresolved decision with no findings", () => {
  const result = resolveSelection(
    {
      ...selected,
      findings: [],
      basis: {
        kind: "unresolved",
        establishedPremise: "Unrelated search match",
        inferenceOrCorrection: "No adequate evidence",
        premiseQuoteIds: ["q1"],
        decisiveQuoteIds: [],
      },
    },
    quotationCatalog(docs),
    docs,
    true,
  );
  expect(result).toMatchObject({
    verdict: "insufficient",
    findings: [],
    evidence: [],
  });
  expect(result.explanation).not.toContain("Unrelated");
});
it("requires a finding inventory in live generation but can read legacy saved selections", () => {
  expect(
    reasonedSelectionSchema.safeParse({
      ...selected,
      basis: {
        kind: "confirmed",
        establishedPremise: "",
        inferenceOrCorrection: "",
        premiseQuoteIds: [],
        decisiveQuoteIds: ["q1"],
      },
    }).success,
  ).toBe(false);
  expect(
    resolveSelection(selected, quotationCatalog(docs), docs).findings,
  ).toBeUndefined();
});

it("requires a conflict to describe both sides from decisive sources", () => {
  const conflictingDocs = [
    ...docs,
    {
      ...docs[0],
      id: "s2",
      url: "https://example.net",
      chunks: [
        {
          id: "s2:p1",
          text: "Drugi dokument podaje inną datę: 14 marca 1999 roku.",
        },
      ],
    },
  ];
  const basis = {
    kind: "conflict",
    establishedPremise: "",
    inferenceOrCorrection: "",
    premiseQuoteIds: [],
    decisiveQuoteIds: ["q1", "q2"],
  };
  const sides = [
    { id: "a", text: "Pierwszy dokument podaje 12 marca.", quoteIds: ["q1"] },
    { id: "b", text: "Drugi dokument podaje 14 marca.", quoteIds: ["q2"] },
  ];
  const draft = {
    ...selected,
    basis,
    evidence: [
      selected.evidence[0],
      { quoteId: "q2", relation: "contradicts", relevance: "Inna data." },
    ],
  };
  const catalog = quotationCatalog(conflictingDocs);
  for (const findings of [
    [sides[0]],
    [{ ...sides[0], quoteIds: ["q1", "q2"] }],
  ]) {
    expect(() =>
      resolveSelection({ ...draft, findings }, catalog, conflictingDocs, true),
    ).toThrow();
  }
  expect(
    resolveSelection(
      { ...draft, findings: sides },
      catalog,
      conflictingDocs,
      true,
    ),
  ).toMatchObject({
    verdict: "insufficient",
    evidenceConflict: true,
  });
});

it("accepts a statement as direct proof that an allegation was made, but not as decisive proof of its content", () => {
  const quote =
    "Organizator zarzucił operatorowi magazynu bezprawne usunięcie eksponatu.";
  const documents = [{ ...docs[0], chunks: [{ id: "p1", text: quote }] }];
  const catalog = quotationCatalog(documents);
  const selection = {
    ...selected,
    proofGaps: [],
    evidence: [{ ...selected.evidence[0], scope: "direct" }],
    findings: [{ id: "speech", text: quote, quoteIds: ["q1"] }],
    basis: {
      kind: "confirmed",
      establishedPremise: "",
      inferenceOrCorrection: "",
      premiseQuoteIds: [],
      decisiveQuoteIds: ["q1"],
    },
  };
  expect(resolveSelection(selection, catalog, documents, true)).toMatchObject({
    verdict: "supported",
    evidence: [{ relation: "supports" }],
  });
  for (const kind of ["confirmed", "contradicted", "mixed_context"]) {
    const contextual = {
      ...selection,
      basis: {
        ...selection.basis,
        kind,
        establishedPremise: quote,
        inferenceOrCorrection: "Zarzut rozstrzyga sprawę.",
        premiseQuoteIds: ["q1"],
      },
      evidence: [
        {
          ...selected.evidence[0],
          scope: "reported_position",
          relation: kind === "contradicted" ? "contradicts" : "supports",
        },
      ],
    };
    expect(() =>
      resolveSelection(contextual, catalog, documents, true),
    ).toThrow();
  }
});
