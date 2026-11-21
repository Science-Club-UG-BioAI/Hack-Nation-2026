import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { getDomain } from "tldts";

// Discovery only. No search summaries, full articles, cookies or API keys are persisted.
const sources = [
  [
    "pap.pl",
    "news",
    "Polska Agencja Prasowa",
    "Polska NATO Unia Europejska historia członkostwo",
  ],
  [
    "factcheck.org",
    "fact_check",
    "FactCheck.org",
    "NATO European Union climate misinformation",
  ],
  [
    "gov.pl",
    "official",
    "Administracja publiczna RP",
    "Polska NATO Unia Europejska historia członkostwo",
  ],
  [
    "nbp.pl",
    "official",
    "Narodowy Bank Polski",
    "złoty euro banknoty polityka pieniężna",
  ],
  [
    "europa.eu",
    "official",
    "Instytucje Unii Europejskiej",
    "Poland European Union euro Schengen membership",
  ],
  [
    "nato.int",
    "official",
    "NATO",
    "Poland NATO membership 1999 history treaty",
  ],
  [
    "un.org",
    "official",
    "Organizacja Narodów Zjednoczonych",
    "United Nations charter membership history climate",
  ],
  [
    "worldbank.org",
    "official",
    "Bank Światowy",
    "Poland economy data population development",
  ],
  [
    "oecd.org",
    "official",
    "OECD",
    "Poland economic survey membership education",
  ],
  [
    "esa.int",
    "official",
    "Europejska Agencja Kosmiczna",
    "Poland space Earth satellites climate",
  ],
  [
    "nasa.gov",
    "official",
    "NASA",
    "Earth moon sun climate planets solar system",
  ],
  [
    "demagog.org.pl",
    "fact_check",
    "Demagog",
    "Polska Unia Europejska euro NATO dezinformacja",
  ],
  [
    "fullfact.org",
    "fact_check",
    "Full Fact",
    "European Union NATO climate misinformation",
  ],
  ["correctiv.org", "fact_check", "CORRECTIV", "Faktencheck EU NATO Klima"],
  [
    "wikipedia.org",
    "encyclopedia",
    "Wikipedia",
    "Polska NATO Unia Europejska Ziemia Księżyc",
  ],
];
const append = process.argv.includes("--append");
const records = append
    ? JSON.parse(await readFile("data/corpus/catalog.json", "utf8")).records
    : [],
  failures = [],
  seen = new Set(records.map((r) => r.url));
let discoveryRequestsThisPass = 0;
if (!process.env.TAVILY_API_KEY) throw new Error("Missing TAVILY_API_KEY");
await mkdir("data/corpus", { recursive: true });
for (const [domain, type, publisher, query] of append
  ? [
      [
        "factcheck.org",
        "fact_check",
        "FactCheck.org",
        "NATO European Union climate misinformation",
      ],
      [
        "pap.pl",
        "news",
        "Polska Agencja Prasowa",
        "Polska NATO Unia Europejska historia członkostwo",
      ],
    ]
  : sources) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      include_domains: [domain],
      max_results: 20,
      search_depth: "advanced",
      include_raw_content: false,
      include_answer: false,
    }),
  });
  if (!response.ok)
    throw new Error(
      `Discovery HTTP ${response.status}; stopped without exposing response`,
    );
  const found = await response.json();
  discoveryRequestsThisPass++;
  for (const hit of found.results ?? []) {
    try {
      const url = new URL(hit.url);
      url.hash = "";
      for (const key of [...url.searchParams.keys()])
        if (key.startsWith("utm_")) url.searchParams.delete(key);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !(url.hostname === domain || url.hostname.endsWith("." + domain)) ||
        seen.has(url.href) ||
        url.pathname === "/" ||
        /\.pdf$/i.test(url.pathname)
      )
        continue;
      seen.add(url.href);
      const page = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Prawdowid/0.3 source-catalog audit",
          Accept: "text/html",
        },
      });
      if (!page.ok || !page.headers.get("content-type")?.includes("text/html"))
        throw new Error(`HTTP ${page.status}`);
      const reader = page.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 3000000) throw new Error("Body limit");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const html = Buffer.concat(chunks).toString("utf8");
      const $ = load(html);
      const title = (
        $('meta[property="og:title"]').attr("content") ||
        $("title").text() ||
        hit.title
      )
        .replace(/\s+/g, " ")
        .trim();
      if (
        title.length < 5 ||
        /access denied|just a moment|attention required|robot check/i.test(
          title,
        )
      )
        throw new Error("Challenge page");
      const date =
        $('meta[property="article:published_time"]').attr("content") ||
        $('meta[name="date"]').attr("content") ||
        null;
      const publishedAt =
        date && !Number.isNaN(Date.parse(date))
          ? new Date(date).toISOString()
          : null;
      const domainGroup = url.hostname.endsWith(".gov.pl")
        ? "gov.pl"
        : getDomain(url.hostname);
      if (
        records.some(
          (r) =>
            r.domain === domainGroup &&
            r.title.toLowerCase() === title.toLowerCase(),
        )
      )
        continue;
      records.push({
        id: createHash("sha256").update(url.href).digest("hex").slice(0, 16),
        title,
        url: url.href,
        domain: domainGroup,
        publisher,
        type,
        publishedAt,
        retrievedAt: new Date().toISOString(),
        discoveryQuery: query,
        discovery: "Tavily Search; verified direct HTTP 200 HTML",
        license:
          "Metadata-only catalog; no full-text redistribution permission asserted",
        licenseUrl: null,
        contentStored: false,
        publicationDateBasis: publishedAt ? "HTML publication meta" : "unknown",
        httpStatus: 200,
      });
    } catch (error) {
      failures.push({
        url: hit.url,
        reason:
          error.name === "TimeoutError"
            ? "timeout"
            : String(error.message).slice(0, 100),
      });
    }
  }
  console.log(
    JSON.stringify({
      domain,
      accepted: records.filter((r) => r.domain === getDomain(domain)).length,
      total: records.length,
    }),
  );
  await writeFile(
    "data/corpus/catalog.candidate.json",
    JSON.stringify(
      { version: 1, builtAt: new Date().toISOString(), records },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    "data/corpus/collection-report.json",
    JSON.stringify(
      {
        failures,
        discoveryRequestsThisPass,
        scope: append
          ? "supplemental pass; not a complete history"
          : "full rebuild",
      },
      null,
      2,
    ) + "\n",
  );
}
const domains = new Set(records.map((r) => r.domain));
console.log(
  JSON.stringify({
    records: records.length,
    domains: domains.size,
    types: [...new Set(records.map((r) => r.type))],
  }),
);
if (records.length < 100 || domains.size < 10) process.exitCode = 1;
else
  await writeFile(
    "data/corpus/catalog.json",
    JSON.stringify(
      { version: 1, builtAt: new Date().toISOString(), records },
      null,
      2,
    ) + "\n",
  );
