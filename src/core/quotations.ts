import { z } from "zod";
import { assessmentSchema, evidenceSchema, type Document } from "./contracts";
import { invalidOutput } from "./errors";
import { validateAssessment } from "./evidence";

// The model selects immutable passages; it never writes the published quotation.
export const selectionSchema = assessmentSchema.extend({
  basis: z
    .object({
      kind: z.enum([
        "confirmed",
        "contradicted",
        "mixed_context",
        "unresolved",
        "conflict",
      ]),
      establishedPremise: z.string().max(700),
      inferenceOrCorrection: z.string().max(700),
      premiseQuoteIds: z.array(z.string().min(1)).max(10),
      decisiveQuoteIds: z.array(z.string().min(1)).max(10),
    })
    .optional(),
  evidence: z
    .array(
      evidenceSchema.pick({ relation: true, relevance: true }).extend({
        quoteId: z.string().min(1),
      }),
    )
    .max(10),
});
// Live generation must supply the evidence-linked decision basis. The legacy
// resolver still reads old saved selections; production uses this stricter schema.
export const reasonedSelectionSchema = selectionSchema.required({
  basis: true,
});

type Quotation = { sourceId: string; chunkId: string; quote: string };

function passages(text: string): string[] {
  const sentences = [
    ...new Intl.Segmenter("pl", { granularity: "sentence" }).segment(text),
  ].map((s) => s.segment);
  const pieces: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim().length >= 12) pieces.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (current.length + sentence.length > 650) flush();
    let remainder = sentence;
    while (remainder.length > 650) {
      const space = remainder.lastIndexOf(" ", 650);
      const end = space >= 300 ? space : 650;
      current = remainder.slice(0, end);
      flush();
      remainder = remainder.slice(end);
    }
    current += remainder;
  }
  flush();
  return pieces;
}

export function quotationCatalog(documents: Document[]) {
  const quotes = new Map<string, Quotation>();
  const modelDocuments = documents.map(({ chunks, ...source }) => ({
    ...source,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      quotations: passages(chunk.text).map((text) => {
        const quoteId = `q${quotes.size + 1}`;
        quotes.set(quoteId, {
          sourceId: source.id,
          chunkId: chunk.id,
          quote: text,
        });
        return { quoteId, text };
      }),
    })),
  }));
  return { quotes, modelDocuments };
}

export function resolveSelection(
  value: unknown,
  catalog: ReturnType<typeof quotationCatalog>,
  documents: Document[],
) {
  const parsed = selectionSchema.safeParse(value);
  if (!parsed.success)
    throw invalidOutput([
      "Return the selection schema: quoteId, relation and relevance; do not write quote text.",
    ]);
  const seen = new Set<string>();
  const basis = parsed.data.basis;
  if (basis) {
    const selected = new Set(parsed.data.evidence.map((e) => e.quoteId));
    if (
      [...basis.premiseQuoteIds, ...basis.decisiveQuoteIds].some(
        (id) => !catalog.quotes.has(id),
      )
    )
      throw invalidOutput([
        "Decision basis references a quotation absent from the supplied catalog.",
      ]);
    // A model may list redundant catalog references it did not publish as evidence.
    // Ignore those references, never add their text or count them as proof. Every
    // required role must still be substantiated by at least one selected citation.
    basis.premiseQuoteIds = basis.premiseQuoteIds.filter((id) =>
      selected.has(id),
    );
    basis.decisiveQuoteIds = basis.decisiveQuoteIds.filter((id) =>
      selected.has(id),
    );
    if (
      ["confirmed", "contradicted", "mixed_context", "conflict"].includes(
        basis.kind,
      ) &&
      !basis.decisiveQuoteIds.length
    )
      throw invalidOutput(["A factual decision requires decisive evidence."]);
    if (
      basis.kind === "mixed_context" &&
      (!basis.premiseQuoteIds.length ||
        !basis.establishedPremise.trim() ||
        !basis.inferenceOrCorrection.trim())
    )
      throw invalidOutput([
        "mixed_context requires an established true premise, its citations and a demonstrated contextual error.",
      ]);
    parsed.data.verdict = (
      {
        confirmed: "supported",
        contradicted: "refuted",
        mixed_context: "misleading",
        unresolved: "insufficient",
        conflict: "insufficient",
      } as const
    )[basis.kind];
    parsed.data.evidenceConflict = basis.kind === "conflict";
  }
  const evidence = parsed.data.evidence.map((item, index) => {
    const quote = catalog.quotes.get(item.quoteId);
    if (!quote)
      throw invalidOutput([
        `evidence[${index}]: quoteId is not in the supplied quotations. Select an existing quoteId.`,
      ]);
    if (seen.has(item.quoteId))
      throw invalidOutput([
        `evidence[${index}]: duplicate quoteId. Each passage can be selected only once.`,
      ]);
    seen.add(item.quoteId);
    return { ...quote, relation: item.relation, relevance: item.relevance };
  });
  // Preserve the original strict substring and verdict validation after materialization.
  return validateAssessment({ ...parsed.data, evidence }, documents);
}
