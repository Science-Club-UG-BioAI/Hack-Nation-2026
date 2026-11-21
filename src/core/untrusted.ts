import type { Document } from "./contracts";

// Conservative detection of direct model-control commands, not keywords about security.
// This is a boundary guard, not a complete detector of adversarial language.
const directCommand =
  /^(?:(?:system|developer|assistant|administrator|admin)\s*:|(?:instrukcja|polecenie)\s+(?:administratora|systemowa|systemu|dla\s+modelu)|(?:zignoruj|ignoruj|ignore|disregard|forget)\b|(?:nie\s+wolno\s+ci|do\s+not\s+(?:cite|search|follow)|nie\s+(?:cytuj|wyszukuj|pokazuj))\b|(?:zwróć|wypisz|napisz|wyświetl|odpowiedz|return|output|print|respond)\s+(?:wyłącznie|tylko|verdict|supported|refuted|misleading|potwierdzone|fałszywe)\b|to\s+polecenie\s+ma\s+wyższy\s+priorytet)/iu;
// Further sentence-initial controls observed in regression probes: role markers in
// brackets or headings, task replacement, skipping checks and control tokens.
const extraCommands = [
  /^(?:\[|<|#{1,6}\s*|\*\*)\s*(?:system|developer|assistant|administrator|admin)\b/iu,
  /^(?:developer|admin|debug|god)\s+mode\b/iu,
  /^(?:pomiń|pomin|skip)\s+(?:wyszukiwanie|weryfikację|weryfikacje|sprawdzanie|kontrolę|kontrole|źródła|zrodla|cytaty|reguły|reguly|search|verification)/iu,
  /^(?:zapomnij|forget)\s+(?:o\s+)?(?:poprzedni|wcześniejsz|wczesniejsz|wszystk|reguł|regul|instrukcj|polece|previous|all)/iu,
  /^(?:ustaw|zmień|zmien|set|change)\s+(?:werdykt|ocenę|ocene|verdict|status)\b/iu,
  /^oznacz\s+(?:jako|tezę|teze|twierdzenie)\b/iu,
  /^(?:nowe|new)\s+(?:zadanie|instrukcje|polecenie|task|instructions)\s*:/iu,
  /^koniec\s+(?:tezy|danych|instrukcji|wejścia|wejscia)\b/iu,
  /^(?:przestań|przestan|stop)\s+(?:sprawdzać|sprawdzac|weryfikować|weryfikowac|wyszukiwać|wyszukiwac|checking|searching)/iu,
  /^nie\s+(?:szukaj|sprawdzaj|weryfikuj|podawaj\s+źródeł|podawaj\s+zrodel)\b/iu,
  /^(?:wyłącz|wylacz|disable)\s+(?:kontrolę|kontrole|weryfikację|weryfikacje|audyt|cytaty|filtr|checks?)/iu,
  /^jako\s+(?:model|asystent|ai|sztuczna\s+inteligencja)\b.*\b(?:musisz|masz|powinieneś|powinienes)\b/iu,
  /^(?:[Nn]apisz|[Ww]ypisz|[Zz]wróć|[Zz]wroc|[Pp]odaj|[Oo]dpowiedz|[Pp]rint|[Oo]utput)\s+(?:wyłącznie\s+|tylko\s+)?[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/u,
];
// Letters split by single separators ("z-i-g-n-o-r-u-j") are joined for detection only.
function joinSpelledOut(text: string) {
  return text.replace(/(?<!\p{L})(?:\p{L}[-._·]){3,}\p{L}(?!\p{L})/gu, (word) =>
    word.replace(/[-._·]/gu, ""),
  );
}
function segments(text: string) {
  return [
    ...new Intl.Segmenter("pl", { granularity: "sentence" }).segment(text),
  ].flatMap((part) =>
    part.segment.split(
      /\n+|(?=[<[]\s*(?:system|developer|assistant|administrator|admin)\b)/iu,
    ),
  );
}
export function hasControlInstruction(text: string) {
  return segments(
    joinSpelledOut(
      text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, ""),
    ),
  ).some((part) => {
    const trimmed = part.trim();
    return (
      directCommand.test(trimmed) ||
      extraCommands.some((pattern) => pattern.test(trimmed))
    );
  });
}
export function guardClaim(claim: string) {
  const kept: string[] = [];
  let removed = 0;
  for (const part of segments(claim)) {
    if (hasControlInstruction(part)) removed++;
    else kept.push(part.trim());
  }
  return { claim: kept.filter(Boolean).join(" "), removed };
}
export function guardDocuments(documents: Document[]) {
  let removed = 0;
  // Drop whole original chunks, never join pieces across an excised instruction.
  // Surviving quotations remain contiguous substrings of the fetched document.
  const clean = documents.flatMap((document) => {
    if (hasControlInstruction(document.title)) {
      removed += document.chunks.length;
      return [];
    }
    const chunks = document.chunks.filter((chunk) => {
      if (hasControlInstruction(chunk.text)) {
        removed++;
        return false;
      }
      return true;
    });
    return chunks.length ? [{ ...document, chunks }] : [];
  });
  return { documents: clean, removed };
}
