import { z } from "zod";
import {
  planSchema,
  verdictLabels,
  type Document,
  type VerifyInput,
} from "@/core/contracts";
import { prepareDocuments, publisherGroup } from "@/core/evidence";
import { invalidOutput } from "@/core/errors";
import {
  reviewDecisions,
  type EvidenceEdge,
  type EvidenceGraph,
  type EvidenceNode,
  type Validation,
} from "@/core/evidence-graph";
import type { ProgressListener } from "@/core/progress";
import { maskPersonalData } from "@/core/privacy";
import { quotationCatalog } from "@/core/quotations";
import {
  guardClaim,
  guardDocuments,
  hasControlInstruction,
} from "@/core/untrusted";
import {
  claimDecision,
  hashText,
  snapshotHash,
  validateGraph,
} from "./graph-validation";
import { generate } from "./providers";
import { retrieve } from "./retrieval";

const id = z.string().min(1).max(80);
const note = z.string().min(1).max(600);
const classification = z.enum([
  "SUPPORTS",
  "CONTRADICTS",
  "CONTEXTUALIZES",
  "IRRELEVANT",
]);
const decisiveClassification = z.enum([
  "SUPPORTS",
  "CONTRADICTS",
  "CONTEXTUALIZES",
]);
const claimsSchema = z
  .object({
    composition: z.enum(["single", "conjunction", "complex"]),
    claims: z
      .array(
        z
          .object({
            text: z.string().min(3).max(500),
            checkable: z.boolean(),
            queries: z.array(z.string().min(3).max(250)).max(2),
            wikipediaQuery: planSchema.shape.wikipediaQuery,
            sejmQuery: planSchema.shape.sejmQuery,
            arxivQuery: planSchema.shape.arxivQuery,
            euvsdisinfoQuery: planSchema.shape.euvsdisinfoQuery,
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export const proposalSchema = z
  .object({
    relations: z
      .array(
        z
          .object({
            quoteId: id,
            claimId: id,
            type: classification,
            reason: note,
          })
          .strict(),
      )
      .max(24),
    inferences: z
      .array(
        z
          .object({
            claimId: id,
            type: decisiveClassification,
            text: note,
            premises: note,
            premiseIds: z.array(id).min(1).max(6),
            reason: note,
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const critiqueSchema = z
  .object({
    reviews: z
      .array(
        z
          .object({
            targetId: id,
            decision: z.enum(reviewDecisions),
            reason: note,
          })
          .strict(),
      )
      .max(100),
    repeats: z
      .array(z.object({ from: id, to: id, reason: note }).strict())
      .max(15),
    limitations: z.array(note).max(6),
    followUp: z
      .object({ claimId: id, query: z.string().min(3).max(250) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

type Claims = z.infer<typeof claimsSchema>;
type Proposal = z.infer<typeof proposalSchema>;
type Critique = z.infer<typeof critiqueSchema>;
type Corpus = { claimId: string; documents: Document[] };
type ClaimNode = Extract<EvidenceNode, { type: "CLAIM" }>;
const valid = (semantic: Validation["semantic"] = "ACCEPT"): Validation => ({
  technical: "valid",
  semantic,
});
const clean = (value: string) => maskPersonalData(value).text;
const untrusted = (value: string) =>
  hasControlInstruction(value) || clean(value) !== value;

export function graphDraft(
  analysisId: string,
  checkedAt: string,
  original: string,
  claims: Claims,
  corpora: Corpus[],
  synthetic = false,
) {
  const graph: EvidenceGraph = {
    version: 1,
    analysisId,
    checkedAt,
    synthetic,
    nodes: [],
    edges: [],
    reviews: [],
    citedChunks: [],
    validation: { technical: "valid", issues: [] },
  };
  const edge = (
    from: string,
    to: string,
    type: EvidenceEdge["type"],
    reason: string,
    semantic: Validation["semantic"] = "ACCEPT",
  ) => {
    const value = {
      id: `edge-${graph.edges.length + 1}`,
      from,
      to,
      type,
      reason: clean(reason),
      validation: valid(semantic),
    };
    graph.edges.push(value);
    return value;
  };
  const root: ClaimNode = {
    id: "claim",
    type: "CLAIM",
    text: original,
    original: true,
    checkable: claims.claims.some((claim) => claim.checkable),
    sourceIds: [],
    validation: valid("NEEDS_REVIEW"),
  };
  const atoms: ClaimNode[] = claims.claims.map((claim, index) => ({
    id: `claim-${index + 1}`,
    type: "CLAIM",
    text: claim.text,
    original: false,
    checkable: claim.checkable,
    sourceIds: [],
    validation: valid("NEEDS_REVIEW"),
  }));
  graph.nodes.push(root, ...atoms);
  for (const atom of atoms)
    edge(
      atom.id,
      root.id,
      "DERIVED_FROM",
      "Twierdzenie wyodrębnione z wypowiedzi.",
    );
  const snapshots = new Map<string, Document>();
  const versions = new Map<string, string>();
  const quotes = new Map<
    string,
    { sourceId: string; chunkId: string; quote: string }
  >();
  const allowed = new Map<string, Set<string>>();
  const modelDocuments = corpora.map(({ claimId, documents }) => {
    const allowedQuotes = new Set<string>();
    allowed.set(claimId, allowedQuotes);
    return {
      claimId,
      documents: documents.map((document) => {
        // Ignore retrieval-local IDs when joining snapshots across claims.
        const key = JSON.stringify([
          document.url,
          document.contentScope,
          document.chunks.map((chunk) => chunk.text),
        ]);
        let documentId = versions.get(key);
        if (!documentId) {
          documentId = `document-${snapshots.size + 1}`;
          versions.set(key, documentId);
          snapshots.set(documentId, document);
          const publisher =
            document.publisherGroup ?? publisherGroup(document.url);
          graph.nodes.push({
            id: documentId,
            type: "DOCUMENT",
            text: document.title,
            title: document.title,
            publisher,
            url: document.url,
            canonicalUrl: document.canonicalUrl ?? document.url,
            publishedAt: document.publishedAt,
            retrievedAt: document.retrievedAt,
            version: snapshotHash(document),
            contentScope: document.contentScope ?? "text",
            sourceIds: [documentId],
            validation: valid("NOT_APPLICABLE"),
          });
        }
        const snapshot = snapshots.get(documentId)!;
        const catalog = quotationCatalog([snapshot]);
        const record = catalog.modelDocuments[0];
        return {
          documentId,
          title: record.title,
          url: record.url,
          publishedAt: record.publishedAt,
          contentScope: record.contentScope,
          publisher: record.publisherGroup,
          notes: record.notes,
          chunks: record.chunks
            .filter(
              (chunk) =>
                !untrusted(
                  snapshot.chunks.find((part) => part.id === chunk.id)!.text,
                ),
            )
            .map((chunk) => ({
              quotations: chunk.quotations.flatMap(({ quoteId, text }) => {
                if (untrusted(text)) return [];
                const key = `${documentId}-${quoteId}`;
                quotes.set(key, {
                  ...catalog.quotes.get(quoteId)!,
                  sourceId: documentId,
                });
                allowedQuotes.add(key);
                return [{ quoteId: key, text }];
              }),
            })),
        };
      }),
    };
  });
  return {
    graph,
    edge,
    snapshots,
    root,
    atoms,
    quotes,
    allowed,
    modelDocuments,
    composition: claims.composition,
  };
}

type Draft = ReturnType<typeof graphDraft>;
export function materialize(draft: Draft, proposal: Proposal) {
  const { graph, edge, snapshots, allowed, quotes } = draft;
  const seen = new Set<string>();
  const available = new Map<string, Set<string>>();
  for (const relation of proposal.relations) {
    const { quoteId, claimId, type } = relation;
    const quote = quotes.get(quoteId);
    const key = `${claimId}/${quoteId}`;
    if (!quote || !allowed.get(claimId)?.has(quoteId) || seen.has(key))
      throw invalidOutput(["Unknown or repeated claim/quote pair."]);
    seen.add(key);
    if (type === "IRRELEVANT") continue;
    const premises = available.get(claimId) ?? new Set();
    premises.add(quoteId);
    available.set(claimId, premises);
    if (!graph.nodes.some((node) => node.id === quoteId)) {
      const chunk = snapshots
        .get(quote.sourceId)!
        .chunks.find((part) => part.id === quote.chunkId)!;
      const start = chunk.text.indexOf(quote.quote);
      graph.nodes.push({
        type: "EVIDENCE",
        id: quoteId,
        text: quote.quote,
        documentId: quote.sourceId,
        chunkId: chunk.id,
        start,
        end: start + quote.quote.length,
        chunkHash: hashText(chunk.text),
        sourceIds: [quote.sourceId],
        validation: valid(),
      });
      if (
        !graph.citedChunks.some(
          (item) =>
            item.documentId === quote.sourceId && item.chunkId === chunk.id,
        )
      )
        graph.citedChunks.push({
          documentId: quote.sourceId,
          chunkId: chunk.id,
          text: chunk.text,
        });
      edge(
        quoteId,
        quote.sourceId,
        "EXTRACTED_FROM",
        "Cytat z zapisanej migawki fragmentów dokumentu.",
      );
    }
    edge(quoteId, claimId, type, relation.reason, "NEEDS_REVIEW");
  }
  for (const [index, inference] of proposal.inferences.entries()) {
    const nodeId = `inference-${index + 1}`;
    const premises = available.get(inference.claimId);
    if (
      !draft.atoms.some(
        (atom) => atom.id === inference.claimId && atom.checkable,
      )
    )
      throw invalidOutput(["Unknown inference claim."]);
    const known = [...new Set(inference.premiseIds)].filter((item) =>
      premises?.has(item),
    );
    const missingPremises = new Set(inference.premiseIds).size - known.length;
    const sourceIds = [
      ...new Set(
        known.flatMap(
          (item) => graph.nodes.find((node) => node.id === item)!.sourceIds,
        ),
      ),
    ];
    graph.nodes.push({
      id: nodeId,
      type: "INFERENCE",
      text: clean(inference.text),
      premises: clean(inference.premises),
      sourceIds,
      missingPremises,
      validation: valid(
        missingPremises ? "NEEDS_MORE_EVIDENCE" : "NEEDS_REVIEW",
      ),
    });
    for (const item of known)
      edge(
        nodeId,
        item,
        "DEPENDS_ON",
        "Przesłanka wskazana dla tego wniosku.",
        "NEEDS_REVIEW",
      );
    edge(
      nodeId,
      inference.claimId,
      inference.type,
      inference.reason,
      "NEEDS_REVIEW",
    );
    if (!missingPremises) premises?.add(nodeId);
  }
}

export function applyCritique(draft: Draft, critique: Critique) {
  const { graph, edge } = draft;
  const targets = new Map(
    [...graph.nodes, ...graph.edges]
      .filter(
        (item) =>
          item.validation.semantic === "NEEDS_REVIEW" ||
          item.validation.semantic === "NEEDS_MORE_EVIDENCE",
      )
      .map((item) => [item.id, item]),
  );
  const seen = new Set<string>();
  for (const review of critique.reviews) {
    if (!targets.has(review.targetId) || seen.has(review.targetId))
      throw invalidOutput(["Unknown or repeated critique target."]);
    seen.add(review.targetId);
  }
  const documentIds = [...draft.snapshots.keys()];
  const pairs = new Set<string>();
  for (const repeat of critique.repeats) {
    const first = documentIds.indexOf(repeat.from);
    const second = documentIds.indexOf(repeat.to);
    if (first === -1 || second === -1 || first === second)
      throw invalidOutput(["Invalid repeated document reference."]);
    const key = [first, second].sort().join("/");
    if (pairs.has(key)) throw invalidOutput(["Repeated document pair."]);
    pairs.add(key);
    edge(repeat.from, repeat.to, "REPEATS", repeat.reason);
  }
  const reviews = new Map(
    critique.reviews.map((review) => [review.targetId, review]),
  );
  for (const [targetId, item] of targets) {
    const review = reviews.get(targetId) ?? {
      targetId,
      decision: "NEEDS_REVIEW" as const,
      reason: "Krytyk nie ocenił tego elementu.",
    };
    if (item.validation.semantic !== "NEEDS_MORE_EVIDENCE")
      item.validation.semantic = review.decision;
    graph.reviews.push({
      ...review,
      decision: item.validation.semantic,
      reason: clean(review.reason),
    });
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  // Materialization orders inference nodes after their premises.
  for (const node of graph.nodes) {
    if (node.type !== "INFERENCE" || node.validation.semantic !== "ACCEPT")
      continue;
    const dependencies = graph.edges.filter(
      (item) => item.from === node.id && item.type === "DEPENDS_ON",
    );
    if (
      dependencies.some(
        (item) =>
          item.validation.semantic !== "ACCEPT" ||
          nodes.get(item.to)?.validation.semantic !== "ACCEPT",
      )
    )
      node.validation.semantic = "NEEDS_MORE_EVIDENCE";
  }
}

export function finishGraph(draft: Draft, limitations: string[]) {
  const { graph, edge, atoms, root } = draft;
  const verdicts = atoms.map((claim) => {
    const decision =
      claim.validation.semantic === "ACCEPT"
        ? claimDecision(graph, claim)
        : { verdict: "insufficient" as const, reasons: [] };
    const id = `verdict-${claim.id}`;
    const conflict =
      decision.reasons.some((item) => item.type === "SUPPORTS") &&
      decision.reasons.some((item) => item.type === "CONTRADICTS");
    const summary = conflict
      ? "Zatwierdzone dowody wskazują sprzeczne ustalenia."
      : decision.verdict === "insufficient"
        ? "Brakuje wystarczającego niezależnego potwierdzenia w jednym kierunku."
        : decision.verdict === "not_checkable"
          ? "Twierdzenie nie ma sprawdzalnej treści faktograficznej."
          : `Zatwierdzone dowody z odrębnych grup źródeł: ${verdictLabels[decision.verdict].toLowerCase()}.`;
    const reasons = [
      ...new Set(decision.reasons.map((item) => item.reason)),
    ].slice(0, 2);
    const text = [summary, ...reasons].join(" ");
    const sourceIds = [
      ...new Set(
        decision.reasons.flatMap(
          (item) =>
            graph.nodes.find((node) => node.id === item.from)!.sourceIds,
        ),
      ),
    ];
    claim.sourceIds = sourceIds;
    graph.nodes.push({
      type: "VERDICT",
      id,
      verdict: decision.verdict,
      text,
      sourceIds,
      limitations,
      validation: valid(
        decision.verdict === "insufficient" ? "NEEDS_MORE_EVIDENCE" : "ACCEPT",
      ),
    });
    edge(id, claim.id, "EVALUATES", "Ocena twierdzenia atomowego.");
    for (const item of decision.reasons)
      edge(id, item.from, "DERIVED_FROM", item.reason);
    return { id, ...decision, sourceIds, text };
  });
  const acceptedSplit =
    root.validation.semantic === "ACCEPT" &&
    atoms.every((atom) => atom.validation.semantic === "ACCEPT");
  const values = verdicts.map((item) => item.verdict);
  const verdict =
    !acceptedSplit || draft.composition === "complex"
      ? "insufficient"
      : !root.checkable
        ? "not_checkable"
        : values.every((item) => item === "supported")
          ? "supported"
          : values.every((item) => item === "refuted")
            ? "refuted"
            : values.every((item) => item === "supported" || item === "refuted")
              ? "misleading"
              : "insufficient";
  const overallLimits =
    draft.composition === "complex"
      ? [
          ...limitations,
          "Nie ustalono reguły łączenia ocen dla złożonej wypowiedzi.",
        ]
      : limitations;
  root.sourceIds = [...new Set(verdicts.flatMap((item) => item.sourceIds))];
  graph.nodes.push({
    type: "VERDICT",
    id: "verdict",
    verdict,
    sourceIds: root.sourceIds,
    text:
      verdicts.length === 1 && verdict === verdicts[0].verdict
        ? verdicts[0].text
        : verdict === "misleading"
          ? "Dowody potwierdzają część twierdzeń, a pozostałym przeczą."
          : verdict === "insufficient"
            ? "Oceny twierdzeń atomowych nie pozwalają rozstrzygnąć całej wypowiedzi."
            : `Ocena wypowiedzi na podstawie ocen twierdzeń atomowych: ${verdictLabels[verdict].toLowerCase()}.`,
    limitations: overallLimits,
    validation: valid(
      verdict === "insufficient" ? "NEEDS_MORE_EVIDENCE" : "ACCEPT",
    ),
  });
  edge("verdict", root.id, "EVALUATES", "Ocena całej wypowiedzi.");
  for (const item of verdicts)
    edge("verdict", item.id, "DERIVED_FROM", "Ocena twierdzenia składowego.");
  graph.validation = validateGraph(graph, draft.snapshots);
  if (graph.validation.technical === "invalid")
    throw invalidOutput(["Evidence graph failed technical validation."]);
  return graph;
}

export async function buildEvidenceGraph(
  input: VerifyInput,
  analysisId: string,
  signal: AbortSignal,
  deadlineAt: number,
  onProgress?: ProgressListener,
) {
  const original = clean(input.claim);
  const guarded = guardClaim(original);
  if (guarded.claim.length < 12 || /^https?:\/\/\S+$/i.test(guarded.claim))
    throw invalidOutput();
  const checkedAt = new Date().toISOString();
  const context = { claim: guarded.claim, statedAt: input.statedAt, checkedAt };
  const model = <T>(
    schema: z.ZodType<T>,
    instruction: string,
    data: unknown,
    operationSignal = signal,
  ) =>
    generate(schema, instruction, data, operationSignal, {
      deadlineAt,
      maxOutputTokens: 6500,
    });
  onProgress?.({ type: "stage", stage: "graph_planning" });
  const claims = claimsSchema.parse(
    await model(
      claimsSchema,
      "Wydziel wszystkie twierdzenia atomowe zachowując podmioty, daty, negacje i zakres. Nie dodawaj faktów. single tylko dla jednej równoważnej tezy; conjunction tylko gdy wszystkie elementy są łącznie równoważne wypowiedzi; dla alternatyw, implikacji i niepewnego podziału użyj complex. Gdy ponad 6 elementów użyj complex i podaj maksymalnie 6. Dla sprawdzalnych twierdzeń podaj dwa różne zapytania: neutralne i celowo szukające kontrdowodów. Dla pozostałych podaj puste queries. Dobierz wikipediaQuery jako nazwę polskiego hasła, sejmQuery jako fragment tytułu aktu i arxivQuery jako angielskie słowa kluczowe, euvsdisinfoQuery jako angielskie słowa kluczowe tylko gdy twierdzenie może dotyczyć prokremlowskiej lub zagranicznej dezinformacji; tylko gdy właściwe, inaczej null.",
      context,
    ),
  );
  if (
    (claims.composition === "single" && claims.claims.length !== 1) ||
    claims.claims.some(
      (claim) =>
        untrusted(claim.text) ||
        (claim.checkable &&
          (claim.queries.length !== 2 ||
            claim.queries[0] === claim.queries[1])) ||
        [
          ...claim.queries,
          claim.wikipediaQuery,
          claim.sejmQuery,
          claim.arxivQuery,
          claim.euvsdisinfoQuery,
        ].some((query) => query && untrusted(query)),
    )
  )
    throw invalidOutput(["Invalid atomic claim or search query."]);
  onProgress?.({ type: "stage", stage: "graph_searching" });
  const limitations = new Set<string>();
  if (guarded.removed)
    limitations.add(
      "Analiza obejmuje treść po oddzieleniu poleceń sterujących.",
    );
  if (claims.composition === "complex")
    limitations.add(
      "Analiza może obejmować najwyżej sześć twierdzeń atomowych.",
    );
  const corpora = await Promise.all(
    claims.claims.flatMap((claim, index) =>
      claim.checkable
        ? [
            (async () => {
              const found = await retrieve(
                {
                  explanation: "Wyszukiwanie twierdzenia atomowego.",
                  clarificationKind: "none",
                  outOfScope: false,
                  needsClarification: false,
                  ...claim,
                },
                signal,
              );
              const prepared = guardDocuments(
                prepareDocuments(
                  found.hits,
                  claim.text,
                  new Date().toISOString(),
                ),
              );
              if (prepared.removed)
                limitations.add(
                  "Pominięto fragmenty zawierające rozpoznane polecenia sterujące.",
                );
              if (
                found.statuses.some(
                  (status) =>
                    status.status === "partial" || status.status === "error",
                )
              ) {
                if (!prepared.documents.length)
                  throw invalidOutput(["Atomic retrieval incomplete."]);
                limitations.add(
                  "Część usług źródłowych nie dostarczyła danych.",
                );
              }
              return {
                claimId: `claim-${index + 1}`,
                documents: prepared.documents,
              };
            })(),
          ]
        : [],
    ),
  );
  const evaluate = async (
    sourceCorpora: Corpus[],
    operationSignal = signal,
  ) => {
    const draft = graphDraft(
      analysisId,
      checkedAt,
      original,
      claims,
      sourceCorpora,
    );
    onProgress?.({ type: "stage", stage: "graph_validating" });
    const modelClaims = draft.atoms.map(({ id, text, checkable }) => ({
      id,
      text,
      checkable,
    }));
    const proposal = draft.quotes.size
      ? proposalSchema.parse(
          await model(
            proposalSchema,
            "Wybierz trafne cytaty wyłącznie przez quoteId z dokumentów przypisanych do claimId. Uwzględnij dowody w obu kierunkach i pominięty kontekst. IRRELEVANT oznacza odrzucenie cytatu. Nie generuj cytatów ani dokumentów. Podaj wyłącznie krótkie, publicznie sprawdzalne przesłanki i wnioski, bez wewnętrznego toku rozumowania. premiseIds może wskazać wybrany quoteId tej samej tezy lub wcześniejszy wniosek inference-N (N to pozycja w tablicy od 1). Jeśli brak przesłanki nie twórz wniosku. Brak potwierdzenia nie jest zaprzeczeniem. Sprawdź daty, zakres i contentScope.",
            {
              ...context,
              claims: modelClaims,
              documents: draft.modelDocuments,
            },
            operationSignal,
          ),
        )
      : { relations: [], inferences: [] };
    materialize(draft, proposal);
    const critique = critiqueSchema.parse(
      await model(
        critiqueSchema,
        "Skontroluj wszystkie elementy ze statusem NEEDS_REVIEW lub NEEDS_MORE_EVIDENCE, podając targetId. Oceń wierność i kompletność podziału, podmiot, daty, aktualność, negację, zakres, brakujący kontekst i niesprawdzone przesłanki. Szukaj pominiętych kontrdowodów w dostarczonych wynikach, w tym cytatów oznaczonych IRRELEVANT. Jeśli pominięcie może zmienić ocenę, oznacz twierdzenie NEEDS_REVIEW. Odrzuć relacje bez uzasadnienia. Brak potwierdzenia nie dowodzi fałszu. W repeats wypisz znane przedruki (from powiela to) używając identyfikatorów dokumentów; nie wymyślaj źródeł. Zgoda modeli nie stanowi dowodu. Podaj ograniczenia, jeśli są istotne. Gdy dodatkowe wyszukiwanie może rozstrzygnąć konkretną lukę, podaj opcjonalne followUp z identyfikatorem twierdzenia atomowego i nowym zapytaniem o potencjalny kontrdowód. W przeciwnym razie pomiń followUp.",
        {
          ...context,
          composition: claims.composition,
          graph: {
            ...draft.graph,
            nodes: draft.graph.nodes.map((node) =>
              node.id === "claim" ? { ...node, text: guarded.claim } : node,
            ),
          },
          documents: draft.modelDocuments,
          classifications: proposal.relations,
        },
        operationSignal,
      ),
    );
    applyCritique(draft, critique);
    return { draft, critique };
  };
  const first = await evaluate(corpora);
  const followUp = first.critique.followUp;
  const firstGraph = finishGraph(first.draft, [
    ...limitations,
    ...first.critique.limitations.map(clean),
  ]);
  if (!followUp) return firstGraph;
  const atomIndex = first.draft.atoms.findIndex(
    (atom) => atom.id === followUp.claimId && atom.checkable,
  );
  if (atomIndex < 0 || untrusted(followUp.query))
    throw invalidOutput(["Invalid follow-up request."]);
  const claim = claims.claims[atomIndex];
  if (
    claim.queries.includes(followUp.query) ||
    deadlineAt - Date.now() < 22_000
  )
    return firstGraph;

  // One optional counter-search and one re-audit, within the original deadline.
  const roundSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
  try {
    onProgress?.({ type: "stage", stage: "graph_searching" });
    const found = await retrieve(
      {
        ...claim,
        queries: [followUp.query],
        clarificationKind: "none",
        explanation: "Dodatkowe wyszukiwanie kontrdowodów.",
        needsClarification: false,
        outOfScope: false,
        wikipediaQuery: null,
        sejmQuery: null,
        arxivQuery: null,
        euvsdisinfoQuery: null,
      },
      roundSignal,
    );
    const fresh = guardDocuments(
      prepareDocuments(found.hits, claim.text, new Date().toISOString()),
    ).documents;
    const match = corpora.find(
      (corpus) => corpus.claimId === followUp.claimId,
    )!;
    const known = new Set(
      match.documents.map((doc) =>
        JSON.stringify([doc.url, snapshotHash(doc)]),
      ),
    );
    const additions = fresh
      .filter((doc) => !known.has(JSON.stringify([doc.url, snapshotHash(doc)])))
      .slice(0, 4);
    if (!additions.length) return firstGraph;
    const revised = await evaluate(
      corpora.map((corpus) =>
        corpus === match
          ? { ...corpus, documents: [...corpus.documents, ...additions] }
          : corpus,
      ),
      AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.max(1, deadlineAt - Date.now() - 1_000)),
      ]),
    );
    return finishGraph(revised.draft, [
      ...limitations,
      ...revised.critique.limitations.map(clean),
    ]);
  } catch {
    signal.throwIfAborted();
    return firstGraph;
  }
}
