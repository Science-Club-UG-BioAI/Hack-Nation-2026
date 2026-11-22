const months = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

const datePattern = new RegExp(
  `(?<![\\p{L}\\d])(?:(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})|(\\d{1,2})\\s+(${months.join("|")})\\s+(\\d{4}))(?![\\p{L}\\d])`,
  "giu",
);

function dates(text: string) {
  return Array.from(text.toLowerCase().matchAll(datePattern), (match) => {
    const [
      ,
      isoYear,
      isoMonth,
      isoDay,
      day,
      month,
      year,
      namedDay,
      name,
      namedYear,
    ] = match;
    return `${isoYear ?? year ?? namedYear}-${(isoMonth ?? month ?? String(months.indexOf(name) + 1)).padStart(2, "0")}-${(isoDay ?? day ?? namedDay).padStart(2, "0")}`;
  });
}

export function preservesContextDates(
  original: string,
  rewritten: string,
  searchTexts: string[],
  relativeDates: string,
) {
  const originalDates = dates(original);
  const rewrittenDates = new Set(dates(rewritten));
  if (originalDates.some((date) => !rewrittenDates.has(date))) return false;
  const allowed = new Set([
    ...originalDates,
    ...dates(relativeDates),
    ...searchTexts.flatMap(dates),
  ]);
  return [...rewrittenDates].every((date) => allowed.has(date));
}
