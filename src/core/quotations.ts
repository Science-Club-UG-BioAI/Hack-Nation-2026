import { z } from "zod";
import {
  assessmentSchema,
  evidenceSchema,
  findingSchema,
  type Document,
} from "./contracts";
import { invalidOutput } from "./errors";
import { validateAssessment } from "./evidence";

const proofGapMessages = {
  attribution:
    "Przytoczone dowody nie rozstrzygają, czy podmiot wskazany w tezie odpowiada za opisane działanie.",
  legal_status:
    "Przytoczone dowody nie rozstrzygają, czy konkretne działanie było zgodne z prawem.",
} as const;

// The model selects immutable passages; it never writes the published quotation.
const scopeDescriptions = {
  event_only:
    "Cytat dokumentuje zdarzenie. Sam nie wskazuje, kto za nie odpowiada.",
  reported_position:
    "Cytat dokumentuje wypowiedź lub zarzut przypisany jego autorowi.",
  limited_legal_assessment:
    "Cytat przedstawia ocenę prawną lub decyzję o ograniczonym zakresie.",
} as const;
const selectedQuotation = evidenceSchema
  .pick({ relation: true, relevance: true })
  .extend({
    quoteId: z.string().min(1),
    scope: z
      .enum([
        "direct",
        "event_only",
        "reported_position",
        "limited_legal_assessment",
      ])
      .optional(),
  });

export const selectionSchema = assessmentSchema.extend({
  proofGaps: z
    .array(z.enum(["attribution", "legal_status"]))
    .max(2)
    .optional(),
  findings: z
    .array(
      findingSchema.omit({ evidenceIds: true }).extend({
        quoteIds: z.array(z.string().min(1)).min(1).max(10),
      }),
    )
    .max(12)
    .optional(),
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
  evidence: z.array(selectedQuotation).max(10),
});
// Live generation must supply the evidence-linked decision basis. The legacy
// resolver still reads old saved selections; production uses this stricter schema.
export const reasonedSelectionSchema = selectionSchema
  .required({
    proofGaps: true,
    basis: true,
    findings: true,
  })
  .extend({
    evidence: z.array(selectedQuotation.required({ scope: true })).max(10),
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
  publish = false,
) {
  const parsed = selectionSchema.safeParse(value);
  if (!parsed.success)
    throw invalidOutput([
      "Return the selection schema: quoteId, relation and relevance; do not write quote text.",
    ]);
  const seen = new Set<string>();
  const basis = parsed.data.basis;
  const originalIds = parsed.data.evidence.map((e) => e.quoteId);
  if (
    new Set(originalIds).size !== originalIds.length ||
    [
      ...originalIds,
      ...(basis?.premiseQuoteIds ?? []),
      ...(basis?.decisiveQuoteIds ?? []),
    ].some((id) => !catalog.quotes.has(id))
  )
    throw invalidOutput([
      "Evidence and decision basis must reference existing catalog quotations; evidence selections must be unique.",
    ]);
  // A reference in a finding is itself an explicit selection by the model.
  // Materialize it from the immutable catalog rather than requiring the same
  // selection to be repeated in two independent arrays. Do not infer support or
  // contradiction: references without an explicit relation remain context.
  for (const [index, finding] of (parsed.data.findings ?? []).entries()) {
    if (
      new Set(finding.quoteIds).size !== finding.quoteIds.length ||
      finding.quoteIds.some((id) => !catalog.quotes.has(id))
    )
      throw invalidOutput([
        `findings[${index}]: duplicate or nonexistent quotation reference.`,
      ]);
    if (publish)
      for (const quoteId of finding.quoteIds) {
        if (!parsed.data.evidence.some((e) => e.quoteId === quoteId))
          parsed.data.evidence.push({
            quoteId,
            relation: "context",
            relevance: "Cytat wskazany przy ustaleniu.",
          });
      }
  }
  if (parsed.data.evidence.length > 10)
    throw invalidOutput([
      "Select at most 10 distinct quotations across evidence and findings; keep only the facts necessary to explain the verdict.",
    ]);
  // A gap here is essential to deciding the whole claim. Event reports and
  // attributed allegations can still substantiate narrower, audited findings.
  const gaps = [...new Set(parsed.data.proofGaps)];
  if (gaps.length && !basis)
    throw invalidOutput(["Proof gaps require a decision basis."]);
  if (gaps.length && basis) {
    basis.kind = "unresolved";
    basis.decisiveQuoteIds = [];
  }
  // An unresolved assessment with explicitly no findings publishes no facts.
  // Do not force the model to invent findings for irrelevant search matches.
  // Conflict and factual decisions still require their normal evidence checks.
  if (
    publish &&
    basis?.kind === "unresolved" &&
    parsed.data.findings?.length === 0
  ) {
    parsed.data.evidence = [];
    basis.premiseQuoteIds = [];
    basis.decisiveQuoteIds = [];
  }
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
    if (parsed.data.proofGaps !== undefined) {
      const decisive = parsed.data.evidence.filter((item) => {
        if (item.scope !== "direct") return false;
        if (basis.kind === "confirmed") return item.relation === "supports";
        if (basis.kind === "contradicted")
          return item.relation === "contradicts";
        return true;
      });
      const directIds = new Set(decisive.map((item) => item.quoteId));
      basis.decisiveQuoteIds = basis.decisiveQuoteIds.filter((id) =>
        directIds.has(id),
      );
    }
    if (
      ["confirmed", "contradicted", "mixed_context", "conflict"].includes(
        basis.kind,
      ) &&
      !basis.decisiveQuoteIds.length
    )
      throw invalidOutput([
        "A factual decision requires a selected decisive quotation directly addressing the claim or the demonstrated correction. If attribution or legal status remains unresolved, report the relevant proofGaps.",
      ]);
    // A conflict must show both sides: decisive passages from at least two
    // different documents, never one source contradicting itself.
    if (
      basis.kind === "conflict" &&
      new Set(
        basis.decisiveQuoteIds.map((id) => catalog.quotes.get(id)!.sourceId),
      ).size < 2
    )
      throw invalidOutput([
        "conflict requires decisiveQuoteIds from at least two different documents showing the incompatible values.",
      ]);
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
    const scope = item.scope;
    const contextOnly = scope !== undefined && scope !== "direct";
    return {
      ...quote,
      id: item.quoteId,
      // In a mixed claim, a decisive passage is explicitly selected to correct
      // its context. It cannot simultaneously support the entire mixed claim.
      // Preserve an explicit contradiction; otherwise label this role context.
      relation:
        contextOnly ||
        gaps.length > 0 ||
        (basis?.kind === "mixed_context" &&
          basis.decisiveQuoteIds.includes(item.quoteId) &&
          item.relation === "supports")
          ? ("context" as const)
          : item.relation,
      relevance: publish
        ? contextOnly
          ? scopeDescriptions[scope]
          : "Powiązanie cytatu z ustaleniem wskazano w uzasadnieniu."
        : item.relevance,
    };
  });
  // Preserve the original strict substring and verdict validation after materialization.
  const findings = parsed.data.findings?.map(({ quoteIds, ...finding }) => ({
    ...finding,
    evidenceIds: quoteIds,
  }));
  const assessment = validateAssessment(
    { ...parsed.data, findings, evidence },
    documents,
  );
  if (!publish) return assessment;
  if (!findings || (evidence.length > 0 && findings.length === 0))
    throw invalidOutput([
      "Provide a complete inventory of factual findings, each with selected quoteIds.",
    ]);
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const finding of findings) {
    const text = finding.text
      .normalize("NFC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (
      ids.has(finding.id) ||
      texts.has(text) ||
      new Set(finding.evidenceIds).size !== finding.evidenceIds.length ||
      finding.evidenceIds.some((id) => !seen.has(id))
    )
      throw invalidOutput([
        "Findings require unique IDs/text and unique references to selected evidence, not just available quotations.",
      ]);
    ids.add(finding.id);
    texts.add(text);
  }
  if (basis?.kind === "conflict") {
    const decisiveIds = new Set(basis.decisiveQuoteIds);
    const covered = new Set(
      findings.flatMap((finding) => {
        const citations = evidence.filter((item) =>
          finding.evidenceIds.includes(item.id),
        );
        const relation = citations[0]?.relation;
        return relation !== "context" &&
          citations.every((item) => item.relation === relation)
          ? citations.map((item) => item.id)
          : [];
      }),
    );
    const positions = evidence.filter(
      (item) => decisiveIds.has(item.id) && covered.has(item.id),
    );
    if (
      !positions.some(
        (support) =>
          support.relation === "supports" &&
          positions.some(
            (opposition) =>
              opposition.relation === "contradicts" &&
              opposition.sourceId !== support.sourceId,
          ),
      )
    )
      throw invalidOutput([
        "For conflict, provide separate findings stating what each side reports, with decisive supporting and contradicting quotations from different documents.",
      ]);
  }
  // Only this inventory is published as model-authored prose. Free-form
  // explanation, limitations and relevance cannot smuggle uncited assertions.
  const explanation = findings.length
    ? findings
        .map(
          (f) =>
            `${f.text} ${f.evidenceIds.map((id) => `[${evidence.findIndex((e) => e.id === id) + 1}]`).join(" ")}`,
        )
        .join("\n\n")
    : "Nie wskazano dowodów rozstrzygających.";
  if (explanation.length > 2500)
    throw invalidOutput([
      "Keep the complete cited explanation within 2500 characters; use concise atomic findings.",
    ]);
  return {
    ...assessment,
    explanation,
    limitations: gaps.map((gap) => proofGapMessages[gap]),
    evidence,
  };
}
