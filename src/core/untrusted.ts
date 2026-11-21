import type { Document } from "./contracts";

// Conservative detection of direct model-control commands, not keywords about security.
// This is a boundary guard, not a complete detector of adversarial language.
const directCommand =
  /^(?:(?:system|developer|assistant|administrator|admin)\s*:|(?:instrukcja|polecenie)\s+(?:administratora|systemowa|systemu|dla\s+modelu)|(?:zignoruj|ignoruj|ignore|disregard|forget)\b|(?:nie\s+wolno\s+ci|do\s+not\s+(?:cite|search|follow)|nie\s+(?:cytuj|wyszukuj|pokazuj))\b|(?:zwróć|wypisz|wyświetl|odpowiedz|return|output|print|respond)\s+(?:wyłącznie|tylko|verdict|supported|refuted|misleading|potwierdzone|fałszywe)\b|to\s+polecenie\s+ma\s+wyższy\s+priorytet)/iu;
function segments(text: string) {
  return [
    ...new Intl.Segmenter("pl", { granularity: "sentence" }).segment(text),
  ].flatMap((part) => part.segment.split(/\n+/u));
}
export function hasControlInstruction(text: string) {
  return segments(
    text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, ""),
  ).some((part) => directCommand.test(part.trim()));
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
