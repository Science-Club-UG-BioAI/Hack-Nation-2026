import { readFile, writeFile } from "node:fs/promises";
import { getDomain } from "tldts";
// Apply editorial metadata only to records in the reviewed catalog.
function enrichRecord(record) {
  const url = new URL(record.url);
  const publishers = {
    "www.bbn.gov.pl": "Biuro Bezpieczeństwa Narodowego",
    "www.senat.gov.pl": "Senat RP",
    "eng.ipn.gov.pl": "Instytut Pamięci Narodowej",
    "study.gov.pl": "Narodowa Agencja Wymiany Akademickiej",
    "zpe.gov.pl": "Zintegrowana Platforma Edukacyjna",
    "european-union.europa.eu": "Unia Europejska",
    "op.europa.eu": "Urząd Publikacji Unii Europejskiej",
    "svs.gsfc.nasa.gov": "NASA Goddard Space Flight Center",
    "shape.nato.int": "Supreme Headquarters Allied Powers Europe (NATO)",
  };
  const ministries = {
    premier: "Kancelaria Prezesa Rady Ministrów",
    civilservice: "Kancelaria Prezesa Rady Ministrów",
    albania: "Ambasada RP w Tiranie",
    nato: "Stałe Przedstawicielstwo RP przy NATO",
    un: "Stałe Przedstawicielstwo RP przy ONZ",
    dyplomacja: "Ministerstwo Spraw Zagranicznych RP",
    diplomacy: "Ministerstwo Spraw Zagranicznych RP",
    "usa-en": "Ministerstwo Spraw Zagranicznych RP",
    "canada-en": "Ministerstwo Spraw Zagranicznych RP",
  };
  const identified =
    publishers[url.hostname] ??
    (url.hostname === "www.gov.pl"
      ? ministries[url.pathname.split("/")[2]]
      : undefined) ??
    (url.hostname === "ec.europa.eu" || url.hostname.endsWith(".ec.europa.eu")
      ? "Komisja Europejska"
      : undefined);
  const generic = [
    "Administracja publiczna RP",
    "Instytucje Unii Europejskiej",
  ].includes(record.publisher);
  record.publisher =
    identified || (!generic && record.publisher) || url.hostname;
  record.publisherIsDomain = record.publisher === url.hostname;
  record.updatedAt ??= null;
  record.eventPeriod ??= null;
  if (record.id === "7adfcc962290a959")
    Object.assign(record, {
      publishedAt: "2024-03-12",
      publicationDateBasis: "Data przy tytule komunikatu KPRM",
      eventPeriod: { from: "1999-03-12", to: "1999-03-12" },
      eventPeriodBasis: "Data przystąpienia do NATO w pierwszym akapicie",
    });
  if (
    url.pathname.endsWith(
      "/secretary-general-thanks-president-duda-for-polands-contributions-following-25-years-of-nato-membership",
    ) &&
    url.hostname === "www.nato.int"
  ) {
    record.eventPeriod = { from: "2024-03-14", to: "2024-03-14" };
    record.eventPeriodBasis =
      "Data spotkania w pierwszym akapicie komunikatu NATO";
  }
  if (record.id === "e1b4835ca4338553")
    Object.assign(record, {
      updatedAt: "2023-05-03T17:54:00Z",
      updatedAtBasis: "Stopka NASA SVS: last updated",
    });
}
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
  const validDate = (value) =>
    value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)));
  for (const x of r)
    if (
      !x.title ||
      !x.publisher ||
      typeof x.publisherIsDomain !== "boolean" ||
      !validDate(x.updatedAt) ||
      (x.eventPeriod !== null &&
        (!x.eventPeriod ||
          !validDate(x.eventPeriod.from) ||
          !validDate(x.eventPeriod.to) ||
          (!x.eventPeriod.from && !x.eventPeriod.to) ||
          (x.eventPeriod.from &&
            x.eventPeriod.to &&
            Date.parse(x.eventPeriod.from) > Date.parse(x.eventPeriod.to)))) ||
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
    knownUpdateDates: r.filter((x) => x.updatedAt).length,
    knownEventPeriods: r.filter((x) => x.eventPeriod).length,
    failures,
  };
}
if (process.argv[1]?.endsWith("check-corpus.mjs")) {
  const path = "data/corpus/catalog.json";
  const catalog = JSON.parse(await readFile(path, "utf8"));
  const enrich = process.argv.includes("--enrich");
  if (enrich) catalog.records.forEach(enrichRecord);
  const stats = corpusStats(catalog);
  console.log(JSON.stringify(stats, null, 2));
  if (stats.failures.length) process.exitCode = 1;
  else if (enrich)
    await writeFile(path, JSON.stringify(catalog, null, 2) + "\n");
}
