import { readFile } from "node:fs/promises";
import { getDomain } from "tldts";
export function corpusStats(catalog) {
  const r = catalog.records,
    domains = new Set(
      r.map((x) =>
        new URL(x.url).hostname.endsWith(".gov.pl")
          ? "gov.pl"
          : getDomain(x.url),
      ),
    ),
    types = new Set(r.map((x) => x.type));
  const failures = [];
  if (r.length < 100) failures.push("Fewer than 100 records");
  if (domains.size < 10)
    failures.push("Fewer than 10 conservatively grouped domains");
  if (
    types.size < 2 ||
    !types.has("official") ||
    ![...types].some((t) => ["encyclopedia", "fact_check", "news"].includes(t))
  )
    failures.push("Primary/secondary source types missing");
  if (
    new Set(r.map((x) => x.url)).size !== r.length ||
    new Set(r.map((x) => x.id)).size !== r.length
  )
    failures.push("Duplicate URL or ID");
  for (const x of r)
    if (
      !x.title ||
      !x.publisher ||
      !x.license ||
      x.contentStored !== false ||
      !Number.isFinite(Date.parse(x.retrievedAt)) ||
      (x.publishedAt !== null && !Number.isFinite(Date.parse(x.publishedAt))) ||
      !x.url.startsWith("https://")
    )
      failures.push("Invalid metadata: " + x.id);
  return {
    records: r.length,
    domains: domains.size,
    domainNames: [...domains].sort(),
    types: [...types].sort(),
    knownPublicationDates: r.filter((x) => x.publishedAt).length,
    failures,
  };
}
if (process.argv[1]?.endsWith("check-corpus.mjs")) {
  const stats = corpusStats(
    JSON.parse(await readFile("data/corpus/catalog.json", "utf8")),
  );
  console.log(JSON.stringify(stats, null, 2));
  if (stats.failures.length) process.exitCode = 1;
}
