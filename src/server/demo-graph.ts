import type { Document, VerificationResult } from "@/core/contracts";
import {
  applyCritique,
  finishGraph,
  graphDraft,
  materialize,
} from "./evidence-graph";

export const syntheticId = "synthetic-graph";
export function syntheticGraphDemo(): VerificationResult {
  const checkedAt = "2026-11-21T09:00:00.000Z";
  const claim =
    "Od 1 grudnia 2026 r. wszyscy pasażerowie autobusów w Brzozowej Dolinie jeżdżą za darmo.";
  const limitations = [
    "Dane syntetyczne: miejscowość, dokumenty i cytaty stworzono do demonstracji grafu.",
  ];
  const documents: Document[] = [
    {
      id: "demo-source-1",
      title: "Fikcyjna uchwała rady",
      url: "https://rada.example.org/uchwala",
      publisherGroup: "Rada Brzozowej Doliny (fikcyjna)",
      publishedAt: "2026-11-01",
      retrievedAt: checkedAt,
      chunks: [
        {
          id: "p1",
          text: "Od 1 grudnia 2026 r. bezpłatne przejazdy we wszystkich autobusach przysługują wyłącznie dzieciom do lat siedmiu.",
        },
      ],
    },
    {
      id: "demo-source-2",
      title: "Fikcyjny raport obserwatora",
      url: "https://obserwator.example.net/raport",
      publisherGroup: "Obserwator Transportu (fikcyjny)",
      publishedAt: "2026-12-02",
      retrievedAt: "2026-12-03T10:00:00.000Z",
      chunks: [
        {
          id: "p2",
          text: "Podczas kontroli 2 grudnia 2026 r. dorośli pasażerowie bez innych ulg kupowali bilety w autobusach Brzozowej Doliny.",
        },
      ],
    },
  ];
  const analysisDate = "2026-12-03T11:00:00.000Z";
  const draft = graphDraft(
    syntheticId,
    analysisDate,
    claim,
    {
      composition: "single",
      claims: [
        {
          text: claim,
          checkable: true,
          queries: [],
          wikipediaQuery: null,
          sejmQuery: null,
          arxivQuery: null,
        },
      ],
    },
    [{ claimId: "claim-1", documents }],
    true,
  );
  materialize(draft, {
    relations: [
      {
        quoteId: "document-1-q1",
        claimId: "claim-1",
        type: "CONTRADICTS",
        reason: "Uchwała ogranicza ulgę do wskazanej grupy.",
      },
      {
        quoteId: "document-2-q1",
        claimId: "claim-1",
        type: "CONTRADICTS",
        reason:
          "Po rozpoczęciu programu część pasażerów nadal kupowała bilety.",
      },
    ],
    inferences: [
      {
        claimId: "claim-1",
        type: "CONTRADICTS",
        premiseIds: ["document-1-q1"],
        premises:
          "Bezpłatny przejazd przyznano wyłącznie dzieciom do lat siedmiu.",
        text: "Uchwała nie wprowadza darmowych przejazdów dla wszystkich.",
        reason: "Zakres uprawnionych nie obejmuje wszystkich pasażerów.",
      },
    ],
  });
  applyCritique(draft, {
    reviews: [...draft.graph.nodes, ...draft.graph.edges]
      .filter((item) => item.validation.semantic === "NEEDS_REVIEW")
      .map((item) => ({
        targetId: item.id,
        decision: "ACCEPT",
        reason: "Przykładowa kontrola danych syntetycznych.",
      })),
    repeats: [],
    limitations,
  });
  const evidenceGraph = finishGraph(draft, limitations);
  return {
    requestId: syntheticId,
    mode: "demo",
    status: "completed",
    claim,
    statedAt: null,
    checkedAt: analysisDate,
    verdict: "refuted",
    explanation:
      "Fikcyjna uchwała przyznaje bezpłatne przejazdy wyłącznie dzieciom do lat siedmiu.",
    limitations,
    sources: documents.map(({ chunks: _chunks, ...source }) => source),
    evidence: [],
    graphStatus: "ready",
    evidenceGraph,
  };
}
