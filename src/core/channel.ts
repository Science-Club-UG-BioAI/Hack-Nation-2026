import {
  resultLabel,
  type ChannelReply,
  type VerificationResult,
} from "./contracts";

import { sourceDisagreement } from "./source-disagreement";

// A deterministic transport formatter, with no extra model call or changed verdict.
export function channelReply(result: VerificationResult): ChannelReply {
  const blocks = [
    "Prawdowid · adapter demonstracyjny Discord (bez wysyłania do Discorda)",
    `Twierdzenie: ${result.claim}`,
    ...(result.checkedClaim
      ? [
          `Sprawdzane twierdzenie po oddzieleniu poleceń: ${result.checkedClaim}`,
        ]
      : []),
    `${result.verdict === null ? "Status obsługi" : "Ocena"}: ${resultLabel(result)}`,
    result.explanation,
    ...(result.verdict === null ? ["Nie wydano werdyktu o prawdziwości."] : []),
    ...(result.evidenceConflict
      ? ["Rozbieżność między źródłami pozostaje nierozstrzygnięta."]
      : []),
    ...sourceDisagreement(result).flatMap(({ label, positions }) => [
      label,
      ...positions.map(({ text, citations }) =>
        [
          text,
          ...citations.map(
            ({ source, number }) =>
              `[${number}] ${source.title} · ${source.url}`,
          ),
        ].join("\n"),
      ),
    ]),
    ...result.evidence.map((e, i) => {
      const source = result.sources.find((s) => s.id === e.sourceId)!;
      const relation = {
        supports: "Potwierdza",
        contradicts: "Zaprzecza",
        context: "Kontekst",
      }[e.relation];
      return `[${i + 1}] ${relation}\n„${e.quote}”\n${e.relevance}\n${source.title}\n${source.url}`;
    }),
    ...result.limitations.map((note) => `Ograniczenie: ${note}`),
    `Czas sprawdzenia: ${result.checkedAt}`,
    ...(result.delivery?.reused
      ? [
          "Ponownie pokazano ten sam wynik z tej sesji. Nie wykonano nowego wyszukiwania.",
        ]
      : []),
  ];
  const messages: string[] = [];
  for (const block of blocks) {
    // Keep the entire answer, including all citations, in bounded transport messages.
    let remaining = block;
    while (remaining.length) {
      const last = messages.length - 1;
      if (last >= 0 && messages[last].length + remaining.length + 2 <= 1800) {
        messages[last] += `\n\n${remaining}`;
        break;
      }
      messages.push(remaining.slice(0, 1800));
      remaining = remaining.slice(1800);
    }
  }
  return { channel: "discord_demo", delivery: "simulated", messages, result };
}
