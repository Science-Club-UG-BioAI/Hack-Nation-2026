const warsawDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function verificationDate(timestamp: number): string {
  return warsawDate.format(timestamp);
}

const dayOffsets: Record<string, number> = {
  dziś: 0,
  dzis: 0,
  dzisiaj: 0,
  wczoraj: -1,
  przedwczoraj: -2,
  jutro: 1,
  pojutrze: 2,
  jeden: -1,
  dwa: -2,
  trzy: -3,
  cztery: -4,
  pięć: -5,
  sześć: -6,
  siedem: -7,
};
const longDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
  timeZone: "UTC",
});

export function relativeDayReferences(claim: string, statedAt: string): string {
  const text = claim.toLowerCase();
  const expressions = new Set<string>();
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}])(?:dziś|dzis|dzisiaj|wczoraj|przedwczoraj|jutro|pojutrze|(?:\d{1,3}|jeden|dwa|trzy|cztery|pięć|sześć|siedem)\s+(?:dni|dzień)\s+temu)(?![\p{L}\p{N}])/gu,
  )) {
    // Do not assign a single day to the tail of a compound number or range.
    if (
      match[0].endsWith("temu") &&
      /(?:\d\s*[-–—,.]|\b(?:dwadzieścia|trzydzieści|czterdzieści|\p{L}+dziesiąt|sto|dwieście|trzysta|czterysta|\p{L}+set|tysiąc|tysiące|tysięcy))\s*$/u.test(
        text.slice(0, match.index),
      )
    )
      continue;
    expressions.add(match[0]);
  }
  return [...expressions]
    .map((phrase) => {
      const [first] = phrase.split(/\s/u);
      const offset = dayOffsets[first] ?? -Number(first);
      const day = new Date(statedAt);
      day.setUTCDate(day.getUTCDate() + offset);
      return `„${phrase}” oznacza ${longDate.format(day)}.`;
    })
    .join(" ");
}
