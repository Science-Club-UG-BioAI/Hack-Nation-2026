// Conservative pattern masking, not general entity recognition. Preserve dates,
// historical facts and public names. No original values or reversible map kept.
export function maskPersonalData(value: string) {
  let count = 0;
  const replace = (text: string, pattern: RegExp, label: string) =>
    text.replace(pattern, () => {
      count++;
      return `[${label}]`;
    });
  let text = replace(
    value,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "EMAIL",
  );
  text = replace(text, /\b(?:PL\s*)?\d{2}(?:[ -]?\d{4}){6}\b/g, "RACHUNEK");
  text = replace(text, /(?<!\d)\d{11}(?!\d)/g, "IDENTYFIKATOR");
  text = replace(
    text,
    /(?<!\d)(?:\+48[ -]?)?(?:\d{3}[ -]\d{3}[ -]\d{3}|\d{9})(?!\d)/g,
    "TELEFON",
  );
  // Explicit labels also cover international telephone formats and addresses.
  text = text.replace(
    /\b(telefon|tel\.?|phone)\s*:?\s*(\+?[\d ()-]{7,20}\d)/gi,
    (_match, label: string) => {
      count++;
      return `${label}: [TELEFON]`;
    },
  );
  return { text, count };
}

export const PRIVACY_NOTICE =
  "Maskujemy rozpoznane adresy e-mail, telefony, 11-cyfrowe identyfikatory i polskie numery rachunków przed wysłaniem do usług AI i wyszukiwania. Maskowanie nie wykrywa wszystkich danych — nie wpisuj informacji poufnych. Zapis sprawdzeń przechowujemy lokalnie do 24 godzin; możesz usunąć sesję.";
