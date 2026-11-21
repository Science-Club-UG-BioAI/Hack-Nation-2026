import type { Verdict } from "./contracts";

export const nodeTypes = [
  "CLAIM",
  "DOCUMENT",
  "EVIDENCE",
  "INFERENCE",
  "VERDICT",
] as const;
export const edgeTypes = [
  "SUPPORTS",
  "CONTRADICTS",
  "CONTEXTUALIZES",
  "EXTRACTED_FROM",
  "DEPENDS_ON",
  "DERIVED_FROM",
  "EVALUATES",
  "REPEATS",
] as const;
export const reviewDecisions = [
  "ACCEPT",
  "REJECT",
  "NEEDS_REVIEW",
  "NEEDS_MORE_EVIDENCE",
] as const;
export type ReviewDecision = (typeof reviewDecisions)[number];
export type Validation = {
  technical: "valid" | "invalid";
  semantic: ReviewDecision | "NOT_APPLICABLE";
};
type Base = {
  id: string;
  text: string;
  sourceIds: string[];
  validation: Validation;
};
export type EvidenceNode = Base &
  (
    | { type: "CLAIM"; original: boolean; checkable: boolean }
    | {
        type: "DOCUMENT";
        title: string;
        publisher: string;
        url: string;
        canonicalUrl: string;
        publishedAt: string | null;
        retrievedAt: string;
        version: string;
        contentScope: string;
      }
    | {
        type: "EVIDENCE";
        documentId: string;
        chunkId: string;
        start: number;
        end: number;
        chunkHash: string;
      }
    | { type: "INFERENCE"; premises: string; missingPremises: number }
    | { type: "VERDICT"; verdict: Verdict; limitations: string[] }
  );
export type EvidenceEdge = {
  id: string;
  from: string;
  to: string;
  type: (typeof edgeTypes)[number];
  reason: string;
  validation: Validation;
  confidence?: number;
};
export type GraphReview = {
  targetId: string;
  decision: ReviewDecision;
  reason: string;
};
export type GraphValidationResult = {
  technical: "valid" | "invalid";
  issues: { targetId: string; reason: string }[];
};
export type EvidenceGraph = {
  version: 1;
  analysisId: string;
  checkedAt: string;
  synthetic: boolean;
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  reviews: GraphReview[];
  // Only the exact, privacy-checked chunks cited by the graph are exportable.
  citedChunks: { documentId: string; chunkId: string; text: string }[];
  validation: GraphValidationResult;
};

export const relationLabels = {
  SUPPORTS: "Wspiera",
  CONTRADICTS: "Przeczy",
  CONTEXTUALIZES: "Dodaje kontekst",
  EXTRACTED_FROM: "Cytat z dokumentu",
  DEPENDS_ON: "Zależy od przesłanki",
  DERIVED_FROM: "Wyprowadzono z",
  EVALUATES: "Ocenia",
  REPEATS: "Powiela",
};
export const nodeLabels = {
  CLAIM: "Twierdzenie",
  DOCUMENT: "Dokument",
  EVIDENCE: "Dowód",
  INFERENCE: "Wniosek",
  VERDICT: "Werdykt",
};
export const semanticLabels = {
  ACCEPT: "Zatwierdzono",
  REJECT: "Odrzucono",
  NEEDS_REVIEW: "Wymaga kontroli",
  NEEDS_MORE_EVIDENCE: "Potrzeba dowodów",
  NOT_APPLICABLE: "Nie dotyczy",
};
