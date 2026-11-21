import { createHash } from "node:crypto";
import type { Document, Verdict } from "@/core/contracts";
import { normalize, safeUrl } from "@/core/evidence";
import {
  edgeTypes,
  type EvidenceEdge,
  type EvidenceGraph,
  type EvidenceNode,
  type GraphValidationResult,
} from "@/core/evidence-graph";

export const hashText = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const snapshotHash = (document: Document) =>
  hashText(JSON.stringify(document.chunks.map((chunk) => chunk.text)));

type NodeType = EvidenceNode["type"];
const directions: Record<EvidenceEdge["type"], [NodeType[], NodeType[]]> = {
  SUPPORTS: [["EVIDENCE", "INFERENCE"], ["CLAIM"]],
  CONTRADICTS: [["EVIDENCE", "INFERENCE"], ["CLAIM"]],
  CONTEXTUALIZES: [["EVIDENCE", "INFERENCE"], ["CLAIM"]],
  EXTRACTED_FROM: [["EVIDENCE"], ["DOCUMENT"]],
  DEPENDS_ON: [["INFERENCE"], ["EVIDENCE", "INFERENCE"]],
  DERIVED_FROM: [
    ["CLAIM", "VERDICT"],
    ["CLAIM", "EVIDENCE", "INFERENCE", "VERDICT"],
  ],
  EVALUATES: [["VERDICT"], ["CLAIM"]],
  REPEATS: [["DOCUMENT"], ["DOCUMENT"]],
};

export function validateGraph(
  graph: EvidenceGraph,
  snapshots: Map<string, Document>,
): GraphValidationResult {
  const issues: GraphValidationResult["issues"] = [];
  const issue = (targetId: string, reason: string) =>
    issues.push({ targetId, reason });
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const allIds = new Set<string>();
  for (const item of [...graph.nodes, ...graph.edges]) {
    if (allIds.has(item.id)) issue(item.id, "Powtórzony identyfikator.");
    allIds.add(item.id);
  }
  const outgoing = (id: string, type: EvidenceEdge["type"]) =>
    graph.edges.filter((edge) => edge.from === id && edge.type === type);
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to || from === to || !edgeTypes.includes(edge.type)) {
      issue(edge.id, "Nieprawidłowy typ lub koniec relacji.");
      continue;
    }
    const [sources, targets] = directions[edge.type];
    if (
      !sources.includes(from.type) ||
      !targets.includes(to.type) ||
      (edge.type === "DERIVED_FROM" &&
        (from.type === "CLAIM"
          ? !(to.type === "CLAIM" && to.original && !from.original)
          : to.type === "CLAIM"))
    )
      issue(edge.id, "Nieprawidłowy kierunek relacji.");
  }
  function reachesDocument(id: string, seen = new Set<string>()): boolean {
    if (seen.has(id)) return false;
    const node = nodes.get(id);
    if (node?.type === "DOCUMENT") return snapshots.has(id);
    const next = new Set(seen).add(id);
    return graph.edges.some(
      (edge) =>
        edge.from === id &&
        ["DERIVED_FROM", "DEPENDS_ON", "EXTRACTED_FROM"].includes(edge.type) &&
        edge.validation.semantic === "ACCEPT" &&
        reachesDocument(edge.to, next),
    );
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string) {
    if (active.has(id)) {
      issue(id, "Cykl zależności.");
      return;
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const edge of graph.edges)
      if (
        edge.from === id &&
        ["DEPENDS_ON", "DERIVED_FROM", "REPEATS"].includes(edge.type)
      )
        visit(edge.to);
    active.delete(id);
    visited.add(id);
  }
  for (const node of graph.nodes) {
    visit(node.id);
    if (
      node.sourceIds.some(
        (id) => nodes.get(id)?.type !== "DOCUMENT" || !snapshots.has(id),
      )
    )
      issue(node.id, "Brak wskazanego dokumentu.");
    if (node.type === "DOCUMENT") {
      const snapshot = snapshots.get(node.id);
      if (
        !snapshot ||
        !safeUrl(node.url) ||
        !safeUrl(node.canonicalUrl) ||
        node.url !== snapshot.url ||
        node.canonicalUrl !== (snapshot.canonicalUrl ?? snapshot.url) ||
        snapshotHash(snapshot) !== node.version
      )
        issue(node.id, "Wersja dokumentu lub adres nie zgadza się z migawką.");
    }
    if (node.type === "EVIDENCE") {
      const chunk = snapshots
        .get(node.documentId)
        ?.chunks.find((part) => part.id === node.chunkId);
      const origins = outgoing(node.id, "EXTRACTED_FROM");
      if (
        !chunk ||
        !Number.isSafeInteger(node.start) ||
        !Number.isSafeInteger(node.end) ||
        node.start < 0 ||
        node.end <= node.start ||
        node.end > chunk.text.length ||
        node.text !== chunk.text.slice(node.start, node.end) ||
        hashText(chunk.text) !== node.chunkHash ||
        origins.length !== 1 ||
        origins[0].to !== node.documentId ||
        node.sourceIds.length !== 1 ||
        node.sourceIds[0] !== node.documentId
      )
        issue(
          node.id,
          "Cytat, zakres lub pochodzenie nie zgadza się z migawką.",
        );
    }
    if (node.type === "INFERENCE") {
      const dependencies = outgoing(node.id, "DEPENDS_ON");
      if (
        !Number.isSafeInteger(node.missingPremises) ||
        node.missingPremises < 0 ||
        (!dependencies.length && !node.missingPremises) ||
        (node.missingPremises > 0 &&
          node.validation.semantic !== "NEEDS_MORE_EVIDENCE")
      )
        issue(
          node.id,
          "Wniosek nie wskazuje przesłanek lub nie oznacza ich braku.",
        );
      const inherited = new Set(
        dependencies.flatMap(
          (dependency) => nodes.get(dependency.to)?.sourceIds ?? [],
        ),
      );
      if (
        inherited.size !== node.sourceIds.length ||
        node.sourceIds.some((source) => !inherited.has(source))
      )
        issue(node.id, "Źródła wniosku nie zgadzają się z jego przesłankami.");
    }
    if (node.type === "VERDICT") {
      if (outgoing(node.id, "EVALUATES").length !== 1)
        issue(node.id, "Werdykt musi oceniać jedno twierdzenie.");
      if (
        ["supported", "refuted", "misleading"].includes(node.verdict) &&
        !reachesDocument(node.id)
      )
        issue(node.id, "Werdykt nie ma zatwierdzonej ścieżki do dokumentu.");
    }
  }
  const recorded = new Set<string>();
  for (const chunk of graph.citedChunks) {
    const key = `${chunk.documentId}/${chunk.chunkId}`;
    if (
      recorded.has(key) ||
      snapshots
        .get(chunk.documentId)
        ?.chunks.find((part) => part.id === chunk.chunkId)?.text !== chunk.text
    )
      issue(
        chunk.documentId,
        "Eksportowany fragment nie zgadza się z migawką.",
      );
    recorded.add(key);
  }
  for (const node of graph.nodes)
    if (
      node.type === "EVIDENCE" &&
      !recorded.has(`${node.documentId}/${node.chunkId}`)
    )
      issue(node.id, "Nie zapisano cytowanego fragmentu.");
  for (const review of graph.reviews)
    if (!allIds.has(review.targetId))
      issue(review.targetId, "Nieznany cel krytyki.");
  return { technical: issues.length ? "invalid" : "valid", issues };
}

// Group transitively by publisher, identical material and reviewed syndication.
export function sourceGroups(graph: EvidenceGraph) {
  const documents = graph.nodes.filter((node) => node.type === "DOCUMENT");
  const groups = new Map(documents.map((node) => [node.id, node.id]));
  const merge = (a: string, b: string) => {
    const left = groups.get(a);
    const right = groups.get(b);
    if (!left || !right || left === right) return;
    for (const [id, group] of groups) if (group === right) groups.set(id, left);
  };
  for (const [index, doc] of documents.entries())
    for (const previous of documents.slice(0, index))
      if (
        doc.publisher === previous.publisher ||
        doc.version === previous.version ||
        doc.canonicalUrl === previous.canonicalUrl
      )
        merge(doc.id, previous.id);
  const excerpts = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.type !== "EVIDENCE") continue;
    const key = normalize(node.text).toLowerCase();
    if (excerpts.has(key)) merge(node.documentId, excerpts.get(key)!);
    else excerpts.set(key, node.documentId);
  }
  for (const edge of graph.edges)
    if (edge.type === "REPEATS" && edge.validation.semantic !== "REJECT")
      merge(edge.from, edge.to);
  return groups;
}

export function claimDecision(
  graph: EvidenceGraph,
  claim: Extract<EvidenceNode, { type: "CLAIM" }>,
): {
  verdict: Verdict;
  reasons: EvidenceEdge[];
} {
  if (!claim.checkable) return { verdict: "not_checkable", reasons: [] };
  const groups = sourceGroups(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const reasons = graph.edges.filter(
    (edge) =>
      edge.to === claim.id &&
      ["SUPPORTS", "CONTRADICTS"].includes(edge.type) &&
      edge.validation.technical === "valid" &&
      edge.validation.semantic === "ACCEPT" &&
      nodes.get(edge.from)?.validation.semantic === "ACCEPT" &&
      nodes.get(edge.from)?.sourceIds.length,
  );
  const supports = reasons.filter((edge) => edge.type === "SUPPORTS");
  const contradicts = reasons.filter((edge) => edge.type === "CONTRADICTS");
  const independent = (edges: EvidenceEdge[]) => {
    const argumentsByGroup = edges.map(
      (edge) =>
        new Set(
          nodes
            .get(edge.from)!
            .sourceIds.map((id) => groups.get(id))
            .filter(Boolean),
        ),
    );
    // Two arguments that share a necessary source do not corroborate each other.
    return argumentsByGroup.some(
      (left, index) =>
        left.size &&
        argumentsByGroup
          .slice(index + 1)
          .some(
            (right) =>
              right.size && [...right].every((group) => !left.has(group)),
          ),
    );
  };
  return {
    verdict:
      supports.length && contradicts.length
        ? "insufficient"
        : independent(supports)
          ? "supported"
          : independent(contradicts)
            ? "refuted"
            : "insufficient",
    reasons,
  };
}
