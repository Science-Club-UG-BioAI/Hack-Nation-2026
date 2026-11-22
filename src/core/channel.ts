import {
  resultLabel,
  type ChannelReply,
  type VerificationResult,
} from "./contracts";

import { sourceDisagreement } from "./source-disagreement";

// A deterministic transport formatter, with no extra model call or changed verdict.
export function channelReply(result: VerificationResult): ChannelReply {
  return {
    channel: "discord_demo",
    delivery: "simulated",
    messages: channelMessages(
      result,
      "KitCheck · adapter demonstracyjny Discord (bez wysyłania do Discorda)",
    ),
    result,
  };
}

function channelBlocks(
  result: VerificationResult,
  heading = "Prawdowid · Discord",
): string[] {
  return [
    heading,
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
}

export function channelText(result: VerificationResult): string {
  return channelBlocks(result).join("\n\n");
}

export function channelMessages(
  result: VerificationResult,
  heading = "Prawdowid · Discord",
): string[] {
  const blocks = channelBlocks(result, heading);
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
      // Do not split a UTF-16 surrogate pair between two Discord messages.
      const end =
        remaining.length > 1800 && /[\uD800-\uDBFF]/.test(remaining[1799])
          ? 1799
          : 1800;
      messages.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
  }
  return messages;
}
