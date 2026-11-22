import type { Document, VerificationResult } from "@/core/contracts";
import { publisherGroup } from "@/core/evidence";
import type {
  EvidenceEdge,
  EvidenceGraph,
  EvidenceNode,
  Validation,
} from "@/core/evidence-graph";
import { maskPersonalData } from "@/core/privacy";
import { hashText, snapshotHash, validateGraph } from "./graph-validation";

const accepted: Validation = { technical: "valid", semantic: "ACCEPT" };
const relationTypes = {
  supports: "SUPPORTS",
  contradicts: "CONTRADICTS",
  context: "CONTEXTUALIZES",
} as const;

export function projectVerificationGraph(
  result: Extract<VerificationResult, { status: "completed" }>,
  documents: Document[],
): EvidenceGraph {
  const nodes: EvidenceNode[] = [];
  const edges: EvidenceEdge[] = [];
  const graph: EvidenceGraph = {
    version: 1,
    analysisId: result.requestId,
    checkedAt: result.checkedAt,
    synthetic: result.mode === "demo",
    nodes,
    edges,
    reviews: [],
    citedChunks: [],
    validation: { technical: "valid", issues: [] },
  };
  const sourceDocuments = new Map(
    documents.map((document) => [document.id, document]),
  );
  const snapshots = new Map<string, Document>();
  const evidenceById = new Map<
    string,
    Extract<EvidenceNode, { type: "EVIDENCE" }>
  >();
  const edge = (
    from: string,
    to: string,
    type: EvidenceEdge["type"],
    reason: string,
  ) => {
    edges.push({
      id: `edge-${edges.length + 1}`,
      from,
      to,
      type,
      reason,
      validation: accepted,
    });
  };
  const claimId = "claim";
  const verdictId = "verdict";
  const linkedEvidence = new Set<string>();

  for (const [index, item] of result.evidence.entries()) {
    const source = sourceDocuments.get(item.sourceId);
    const original = source?.chunks.find((chunk) => chunk.id === item.chunkId);
    const position = original?.text.indexOf(item.quote) ?? -1;
    if (!source || !original || position < 0)
      throw new Error("Published quotation missing from its source");

    const documentId = `document-${source.id}`;
    const evidenceId = `evidence-${index + 1}`;
    let snapshot = snapshots.get(documentId);
    if (!snapshot) {
      snapshot = { ...source, chunks: [] };
      snapshots.set(documentId, snapshot);
    }
    // Share the same quotation as the result. Include surrounding text only when safe to expose.
    const keepContext = maskPersonalData(original.text).text === original.text;
    const chunk = keepContext
      ? original
      : { id: `${original.id}:${evidenceId}`, text: item.quote };
    const start = keepContext ? position : 0;
    if (!snapshot.chunks.some((part) => part.id === chunk.id)) {
      snapshot.chunks.push(chunk);
      graph.citedChunks.push({
        documentId,
        chunkId: chunk.id,
        text: chunk.text,
      });
    }
    const evidence: Extract<EvidenceNode, { type: "EVIDENCE" }> = {
      id: evidenceId,
      type: "EVIDENCE",
      text: item.quote,
      documentId,
      chunkId: chunk.id,
      start,
      end: start + item.quote.length,
      chunkHash: hashText(chunk.text),
      sourceIds: [documentId],
      validation: accepted,
    };
    nodes.push(evidence);
    if (item.id) evidenceById.set(item.id, evidence);
    edge(
      evidenceId,
      documentId,
      "EXTRACTED_FROM",
      "Cytat z zapisanego fragmentu dokumentu.",
    );
    edge(evidenceId, claimId, relationTypes[item.relation], item.relevance);
  }

  for (const [index, finding] of (result.findings ?? []).entries()) {
    if (!finding.evidenceIds.length)
      throw new Error("Published finding missing its citations");
    const id = `finding-${index + 1}`;
    const sourceIds = new Set<string>();
    for (const evidenceId of finding.evidenceIds) {
      const premise = evidenceById.get(evidenceId);
      if (!premise) throw new Error("Published finding missing its citations");
      linkedEvidence.add(premise.id);
      sourceIds.add(premise.documentId);
      edge(
        id,
        premise.id,
        "DEPENDS_ON",
        "Cytat przypisany do ustalenia w opublikowanej analizie.",
      );
    }
    nodes.push({
      id,
      type: "INFERENCE",
      text: finding.text,
      premises: "Cytaty przypisane do tego ustalenia.",
      missingPremises: 0,
      sourceIds: [...sourceIds],
      validation: accepted,
    });
    edge(verdictId, id, "DERIVED_FROM", "Ustalenie z uzasadnienia werdyktu.");
  }

  for (const item of nodes)
    if (item.type === "EVIDENCE" && !linkedEvidence.has(item.id))
      edge(
        verdictId,
        item.id,
        "DERIVED_FROM",
        "Cytat uwzględniony w opublikowanej ocenie.",
      );

  const sourceIds = [...snapshots.keys()];
  nodes.unshift(
    {
      id: claimId,
      type: "CLAIM",
      original: true,
      checkable: result.verdict !== "not_checkable",
      text: result.checkedClaim ?? result.claim,
      sourceIds,
      validation: { ...accepted, semantic: "NOT_APPLICABLE" },
    },
    {
      id: verdictId,
      type: "VERDICT",
      verdict: result.verdict,
      text: result.explanation,
      limitations: result.limitations,
      sourceIds,
      validation:
        result.verdict === "insufficient"
          ? { ...accepted, semantic: "NEEDS_MORE_EVIDENCE" }
          : accepted,
    },
  );
  edge(verdictId, claimId, "EVALUATES", "Ocena sprawdzanej wypowiedzi.");
  for (const [id, source] of snapshots) {
    nodes.push({
      id,
      type: "DOCUMENT",
      title: source.title,
      text: source.title,
      url: source.url,
      canonicalUrl: source.canonicalUrl ?? source.url,
      publisher: source.publisherGroup ?? publisherGroup(source.url),
      publishedAt: source.publishedAt,
      retrievedAt: source.retrievedAt,
      version: snapshotHash(source),
      contentScope: source.contentScope ?? "text",
      sourceIds: [id],
      validation: { ...accepted, semantic: "NOT_APPLICABLE" },
    });
  }
  graph.validation = validateGraph(graph, snapshots);
  if (graph.validation.technical !== "valid")
    throw new Error("Published graph failed technical validation");
  return graph;
}
