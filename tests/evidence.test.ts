import { describe, expect, it } from "vitest";
import {
  prepareDocuments,
  safeUrl,
  validateAssessment,
  requireCorroboration,
  publisherGroup,
} from "@/core/evidence";
import {
  verifyInputSchema,
  type Assessment,
  type Document,
} from "@/core/contracts";

const document: Document = {
  id: "s1",
  title: "Test source",
  url: "https://example.org/source",
  publishedAt: null,
  retrievedAt: "2026-11-21T09:00:00Z",
  chunks: [
    {
      id: "s1:p0",
      text: "Poland joined NATO on 12 March 1999. This is a test source passage.",
    },
  ],
};
const assessment: Assessment = {
  verdict: "supported",
  explanation: "Źródło potwierdza datę.",
  limitations: [],
  evidence: [
    {
      sourceId: "s1",
      chunkId: "s1:p0",
      quote: "Poland joined NATO on 12 March 1999.",
      relation: "supports",
      relevance: "Data przystąpienia Polski.",
    },
  ],
};

describe("citation validation", () => {
  it("accepts a real contiguous quotation", () =>
    expect(validateAssessment(assessment, [document])).toEqual(assessment));
  it("allows whitespace differences only", () =>
    expect(
      validateAssessment(
        {
          ...assessment,
          evidence: [
            {
              ...assessment.evidence[0],
              quote: "Poland joined\nNATO on 12 March 1999.",
            },
          ],
        },
        [document],
      ),
    ).toBeTruthy());
  it.each([
    { sourceId: "invented" },
    { chunkId: "invented" },
    { quote: "Poland joined NATO on 12 March 2004." },
    { quote: "Poland joined ... 1999." },
    { quote: "Polska dołączyła do NATO 12 marca 1999 roku." },
  ])("rejects fabricated source/passage/quote: %j", (patch) =>
    expect(() =>
      validateAssessment(
        { ...assessment, evidence: [{ ...assessment.evidence[0], ...patch }] },
        [document],
      ),
    ).toThrow(),
  );
  it.each(["supported", "refuted", "misleading"])(
    "does not allow %s without evidence",
    (verdict) =>
      expect(() =>
        validateAssessment({ ...assessment, verdict, evidence: [] }, [
          document,
        ]),
      ).toThrow(),
  );
  it("requires both sides for a flagged evidence conflict", () =>
    expect(() =>
      validateAssessment(
        { ...assessment, verdict: "insufficient", evidenceConflict: true },
        [document],
      ),
    ).toThrow());
  it("allows insufficient without evidence", () =>
    expect(
      validateAssessment(
        { ...assessment, verdict: "insufficient", evidence: [] },
        [],
      ),
    ).toBeTruthy());
  it("rejects a contradiction presented as support", () =>
    expect(() =>
      validateAssessment({ ...assessment, verdict: "refuted" }, [document]),
    ).toThrow());
});
describe("source preparation", () => {
  it("groups government subdomains and Wikipedia language editions", () => {
    expect(publisherGroup("https://api.sejm.gov.pl/eli")).toBe("gov.pl");
    expect(publisherGroup("https://www.gov.pl/web/msz")).toBe("gov.pl");
    expect(publisherGroup("https://en.wikipedia.org/wiki/Poland")).toBe(
      publisherGroup("https://pl.wikipedia.org/wiki/Polska"),
    );
  });
  it("retains a real single-source quotation but withholds a categorical verdict", () => {
    const result = requireCorroboration(assessment, [document]);
    expect(result.verdict).toBe("insufficient");
    expect(result.evidence).toEqual(assessment.evidence);
  });
  it("does not count context from another publisher as corroboration", () => {
    const other = { ...document, id: "s2", url: "https://other.org/a" };
    const result = requireCorroboration(
      {
        ...assessment,
        evidence: [
          ...assessment.evidence,
          { ...assessment.evidence[0], sourceId: "s2", relation: "context" },
        ],
      },
      [document, other],
    );
    expect(result.verdict).toBe("insufficient");
  });
  it("collapses near-identical syndicated copies", () => {
    const raw = Array.from({ length: 100 }, (_, i) => `unique-word-${i}`).join(
      " ",
    );
    expect(
      prepareDocuments(
        [
          { title: "A", url: "https://one.org", raw_content: raw },
          {
            title: "B",
            url: "https://two.org",
            raw_content: `Different headline ${raw} Other footer`,
          },
        ],
        "word",
        "now",
      ),
    ).toHaveLength(1);
  });
  it("reserves room for different publishers", () => {
    const hits = Array.from({ length: 12 }, (_, i) => ({
      title: `${i}`,
      url: `https://one.org/${i}`,
      raw_content: `Distinct material ${i} with enough characters for preparing a document.`,
    }));
    hits.push({
      title: "Other",
      url: "https://two.org",
      raw_content:
        "An entirely different publisher has a relevant source passage.",
    });
    const docs = prepareDocuments(hits, "material", "now");
    expect(docs.some((d) => d.publisherGroup === "two.org")).toBe(true);
    expect(docs.filter((d) => d.publisherGroup === "one.org")).toHaveLength(3);
  });
  const hit = {
    title: "Source",
    url: "https://example.org/a",
    raw_content: document.chunks[0].text,
  };
  it("deduplicates copied content across domains", () =>
    expect(
      prepareDocuments(
        [hit, { ...hit, url: "https://second.example/a" }],
        "Poland NATO",
        "now",
      ),
    ).toHaveLength(1));
  it("deduplicates tracking variants", () =>
    expect(
      prepareDocuments(
        [
          hit,
          {
            ...hit,
            url: hit.url + "?utm_source=test",
            raw_content: hit.raw_content + " A newer edition.",
          },
        ],
        "Poland NATO",
        "now",
      ),
    ).toHaveLength(1));
  it("does not use snippets as evidence", () =>
    expect(
      prepareDocuments(
        [{ title: "Snippet only", url: hit.url }],
        "Poland",
        "now",
      ),
    ).toEqual([]));
  it("does not let an unusable first result hide a usable version of the same URL", () => {
    const docs = prepareDocuments(
      [
        {
          ...hit,
          raw_content: Array.from({ length: 20 }, (_, i) => `row ${i}`).join(
            "\n\n",
          ),
        },
        hit,
      ],
      "Poland",
      "now",
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].chunks[0].text).toBe(hit.raw_content);
  });
  it("rejects unsafe URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://user:password@example.org")).toBeNull();
  });
  it("preserves unknown publication dates", () =>
    expect(prepareDocuments([hit], "Poland", "now")[0].publishedAt).toBeNull());
  it("bounds document count and context size", () => {
    const docs = prepareDocuments(
      Array.from({ length: 10 }, (_, i) => ({
        ...hit,
        url: `https://example${i}.org/a`,
        raw_content: Array.from(
          { length: 800 },
          (_, j) => `document${i}word${j}`,
        ).join(" "),
      })),
      "Poland",
      "now",
    );
    expect(docs).toHaveLength(10);
    expect(
      docs.reduce(
        (sum, d) => sum + d.chunks.reduce((n, c) => n + c.text.length, 0),
        0,
      ),
    ).toBeLessThanOrEqual(40_000);
  });
});
describe("input contract", () => {
  it.each(["", "a".repeat(501)])("rejects invalid length", (claim) =>
    expect(verifyInputSchema.safeParse({ claim }).success).toBe(false),
  );
  it("rejects impossible dates", () =>
    expect(
      verifyInputSchema.safeParse({
        claim: "Polska przystąpiła do NATO w 1999 roku.",
        statedAt: "2026-02-30",
      }).success,
    ).toBe(false));
  it("rejects client-provided verdicts", () =>
    expect(
      verifyInputSchema.safeParse({
        claim: "Polska przystąpiła do NATO w 1999 roku.",
        verdict: "supported",
      }).success,
    ).toBe(false));
});
