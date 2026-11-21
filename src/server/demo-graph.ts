import type { Document, VerificationResult } from "@/core/contracts";
import { projectVerificationGraph } from "./verification-graph";

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
  const findings = [
    {
      id: "free-rides",
      text: "Uchwała nie wprowadza darmowych przejazdów dla wszystkich.",
      evidenceIds: ["example-1", "example-2"],
    },
  ];
  const result: Extract<VerificationResult, { status: "completed" }> = {
    requestId: syntheticId,
    mode: "demo",
    status: "completed",
    claim,
    statedAt: null,
    checkedAt: "2026-12-03T11:00:00.000Z",
    verdict: "refuted",
    citationContract: "findings-v1",
    explanation: `${findings[0].text} [1] [2]`,
    limitations,
    findings,
    sources: documents.map(({ chunks: _chunks, ...source }) => source),
    evidence: documents.map((source, index) => ({
      id: `example-${index + 1}`,
      sourceId: source.id,
      chunkId: source.chunks[0].id,
      quote: source.chunks[0].text,
      relation: "contradicts",
      relevance:
        index === 0
          ? "Uchwała ogranicza ulgę do wskazanej grupy."
          : "Po rozpoczęciu programu część pasażerów nadal kupowała bilety.",
    })),
  };
  return {
    ...result,
    graphStatus: "ready",
    evidenceGraph: projectVerificationGraph(result, documents),
  };
}
