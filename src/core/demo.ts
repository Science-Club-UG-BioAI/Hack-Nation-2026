import type { VerificationResult } from "./contracts";

export const demoExamples = [
  {
    id: "nato",
    label: "Potwierdzenie",
    claim: "Polska przystąpiła do NATO 12 marca 1999 roku.",
  },
  {
    id: "eu",
    label: "Błędna data",
    claim: "Polska przystąpiła do Unii Europejskiej w 1999 roku.",
  },
  {
    id: "context",
    label: "Brak kontekstu",
    claim: "Wydatki wzrosły dwukrotnie w porównaniu z poprzednim okresem.",
  },
  {
    id: "synthetic-graph",
    label: "Graf dowodowy · dane syntetyczne",
    claim:
      "Od 1 grudnia 2026 r. wszyscy pasażerowie autobusów w Brzozowej Dolinie jeżdżą za darmo.",
  },
] as const;

// Curated examples, never substituted for a live provider response.
export function demoResult(id: string): VerificationResult | null {
  const example = demoExamples.find((e) => e.id === id);
  if (!example || id === "synthetic-graph") return null;
  const checkedAt = "2026-11-21T09:00:00.000Z";
  const base = {
    requestId: `demo-${id}`,
    claim: example.claim,
    statedAt: null,
    checkedAt,
    mode: "demo" as const,
    citationContract: "findings-v1" as const,
    findings: [],
  };
  if (id === "context")
    return {
      ...base,
      status: "needs_clarification",
      verdict: null,
      explanation:
        "Nie wiadomo, o jakie wydatki, kraj i okres chodzi. Doprecyzuj tezę przed wyszukiwaniem.",
      limitations: [
        "Przykład przygotowany ręcznie. Nie wykonano wyszukiwania online.",
      ],
      sources: [],
      evidence: [],
    };
  const nato = id === "nato";
  return {
    ...base,
    status: "completed",
    coverage: {
      citedSources: 2,
      publisherGroups: 2,
      reviewedSources: 2,
      minimumGroups: 2,
    },
    verdict: nato ? "supported" : "refuted",
    findings: [
      {
        id: "f1",
        text: nato
          ? "Polska przystąpiła do NATO 12 marca 1999 roku."
          : "Polska przystąpiła do Unii Europejskiej 1 maja 2004 roku.",
        evidenceIds: ["q1", "q2"],
      },
    ],
    explanation: nato
      ? "Polska przystąpiła do NATO 12 marca 1999 roku. [1] [2]"
      : "Polska przystąpiła do Unii Europejskiej 1 maja 2004 roku. [1] [2]",
    limitations: [
      "Przykład przygotowany ręcznie na podstawie wskazanych źródeł. Nie jest bieżącą analizą AI. Różni wydawcy nie gwarantują niezależnego pochodzenia informacji.",
    ],
    sources: [
      {
        id: "s1",
        title: nato
          ? "Poland and NATO — NATO History"
          : "Poland — European Union",
        url: nato
          ? "https://nato.int/en/about-us/nato-history/history-by-theme/my-country-and-nato/poland-and-nato"
          : "https://european-union.europa.eu/principles-countries-history/eu-countries/poland_en",
        publishedAt: null,
        retrievedAt: checkedAt,
      },
      {
        id: "s2",
        title: nato
          ? "20 lat Polski w NATO — MON"
          : "Polska w UE — Portal Gov.pl",
        url: nato
          ? "https://www.gov.pl/web/obrona-narodowa/20-lat-polski-w-nato"
          : "https://www.gov.pl/web/ue/polska-w-ue",
        publishedAt: null,
        retrievedAt: checkedAt,
        provider: "web",
        sourceType: "official",
        contentScope: "text",
        publisherGroup: "gov.pl",
      },
    ],
    evidence: [
      {
        id: "q1",
        sourceId: "s1",
        chunkId: "s1:p0",
        quote: nato
          ? "Poland produced a commemorative stamp for its accession to NATO on 12 March 1999."
          : "EU Member State: since 1 May 2004",
        relation: nato ? "supports" : "contradicts",
        relevance: nato
          ? "Źródło bezpośrednio określa datę przystąpienia."
          : "Źródło podaje inną datę niż sprawdzana teza.",
      },
      {
        id: "q2",
        sourceId: "s2",
        chunkId: "s2:p0",
        quote: nato
          ? "12 marca 1999 roku Polska, Czechy i Węgry jako pierwsze kraje z dawnego bloku wschodniego wstąpiły do NATO."
          : "Polska jest członkiem Unii Europejskiej od 1 maja 2004 r.",
        relation: nato ? "supports" : "contradicts",
        relevance:
          "Polski portal rządowy podaje tę samą datę co organizacja międzynarodowa.",
      },
    ],
  };
}
