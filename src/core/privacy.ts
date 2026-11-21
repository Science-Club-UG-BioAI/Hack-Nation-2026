// National IBAN lengths (SWIFT registry). Consume exactly the national length
// so a following date or word cannot become part of the account number.
const ibanCountries: Record<number, string> = {
  15: "NO",
  16: "BE",
  18: "DK FI FK FO GL NL SD",
  19: "MK SI",
  20: "AT BA EE KZ LT LU MN XK",
  21: "CH HR LI LV",
  22: "BG BH CR DE GB GE IE ME RS VA",
  23: "AE GI IL IQ OM SO TL",
  24: "AD CZ ES MD PK RO SA SE SK TN VG",
  25: "LY PT ST",
  26: "IS TR",
  27: "BI CG DJ FR GR IT MC MR SM",
  28: "AL AZ BY CY DO GT HN HU LB NI PL SV",
  29: "BR EG PS QA UA",
  30: "JO KW MU YE",
  31: "MT SC",
  32: "LC",
  33: "RU",
};
const ibanFormats = Object.entries(ibanCountries).map(([size, codes]) => {
  const length = Number(size) - 4;
  const group = "[ \\u00a0-]?[A-Z0-9]";
  const fullGroups = `(?:${group}[A-Z0-9]{3}){${Math.floor(length / 4)}}`;
  const tail = length % 4 ? `${group}[A-Z0-9]{${(length % 4) - 1}}` : "";
  return `(?:${codes.split(" ").join("|")})\\d{2}${fullGroups}${tail}`;
});
const foreignIban = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${ibanFormats.join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

function validIban(value: string) {
  const iban = value.toUpperCase().replace(/[\s-]/g, "");
  let remainder = 0;
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const digit = parseInt(ch, 36);
    remainder = (remainder * (digit < 10 ? 10 : 100) + digit) % 97;
  }
  return remainder === 1;
}

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
  text = text.replace(foreignIban, (match) => {
    if (!validIban(match)) return match;
    count++;
    return "[RACHUNEK]";
  });
  text = replace(text, /\b(?:PL\s*)?\d{2}(?:[ -]?\d{4}){6}\b/g, "RACHUNEK");
  text = text.replace(
    /(?<![\p{L}\p{N}])([a-z]{3})[ -]?(\d{6})(?![\p{L}\p{N}])/giu,
    (match, letters: string, digits: string, offset: number) => {
      const id = letters.toUpperCase() + digits;
      const weights = [7, 3, 1, 9, 7, 3, 1, 7, 3];
      const sum = [...id].reduce(
        (value, ch, i) => value + weights[i] * parseInt(ch, 36),
        0,
      );
      const labelled =
        /(?:dow[oó]d(?:u)?(?: osobist(?:y|ego))?)\s*(?:nr\.?\s*)?[:#-]?\s*$/iu.test(
          text.slice(0, offset),
        );
      if (!labelled && (letters !== letters.toUpperCase() || sum % 10 !== 0))
        return match;
      count++;
      return "[DOWÓD]";
    },
  );
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
  "Maskujemy rozpoznane adresy e-mail, telefony, 11-cyfrowe identyfikatory, numery polskich dowodów osobistych i rachunków oraz zagraniczne numery IBAN przed wysłaniem do usług AI i wyszukiwania. Maskowanie nie wykrywa wszystkich danych — nie wpisuj informacji poufnych. Zapis sprawdzeń przechowujemy lokalnie do 24 godzin; możesz usunąć sesję.";
