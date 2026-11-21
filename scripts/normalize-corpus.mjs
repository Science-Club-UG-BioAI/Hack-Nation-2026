import { readFile, writeFile } from "node:fs/promises";
import { getDomain } from "tldts";
const file = "data/corpus/catalog.json",
  catalog = JSON.parse(await readFile(file, "utf8")),
  seen = new Set();
catalog.records = catalog.records.filter((r) => {
  const u = new URL(r.url);
  r.domain = u.hostname.endsWith(".gov.pl") ? "gov.pl" : getDomain(u.hostname);
  if (u.pathname === "/") return false;
  const key = r.domain + "|" + r.title.toLowerCase().trim();
  if (seen.has(key)) return false;
  seen.add(key);
  r.licenseUrl = null; // Unknown is not a license grant; homepage is not a license reference.
  return true;
});
await writeFile(file, JSON.stringify(catalog, null, 2) + "\n");
