import { load } from "cheerio";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { addAbortListener } from "node:events";
import type { SearchHit } from "@/core/evidence";
import { readBoundedText } from "./read-body";
import { startCall, type UsageCall } from "./config";

const USER_AGENT =
  "Prawdowid/0.2 (https://github.com/Science-Club-UG-BioAI/Hack-Nation-2026)";
export type SourceBatch = {
  hits: SearchHit[];
  partial: boolean;
  unavailableArticles?: { title: string; url: string }[];
};

// Fixed API hosts only. Bound the downloaded body before parsing HTML/XML/JSON.
async function read(
  url: URL,
  signal: AbortSignal,
  searchProvider?: Extract<
    UsageCall["provider"],
    "wikipedia" | "sejm" | "arxiv"
  >,
): Promise<string> {
  if (searchProvider) startCall(searchProvider).costUsd = 0;
  const response = await fetch(url, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, application/atom+xml, text/html",
    },
  });
  if (!response.ok || !response.body) throw new Error("Source API unavailable");
  return readBoundedText(
    response.body,
    3_000_000,
    new Error("Source response too large"),
    signal,
  );
}

function endpoint(base: string, params: Record<string, string>): URL {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url;
}

export function htmlText(html: string): string {
  const $ = load(html);
  $(
    "script,style,nav,header,footer,.mw-editsection,.reference,.references,.reflist,.navbox,.toc",
  ).remove();
  $("p,div,li,tr,h1,h2,h3,h4,section,br").append("\n\n");
  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

async function collect(tasks: Promise<SearchHit>[]): Promise<SourceBatch> {
  const results = await Promise.allSettled(tasks);
  const hits = results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  if (tasks.length && !hits.length)
    throw new Error("All source documents failed");
  return { hits, partial: hits.length < tasks.length };
}

export async function wikipedia(
  query: string,
  signal: AbortSignal,
): Promise<SourceBatch> {
  const base = "https://pl.wikipedia.org/w/api.php";
  const result = z
    .object({
      query: z.object({
        search: z
          .array(
            z.object({
              pageid: z.number().int().positive(),
              title: z.string(),
            }),
          )
          .max(3),
      }),
    })
    .parse(
      JSON.parse(
        await read(
          endpoint(base, {
            action: "query",
            list: "search",
            srsearch: query,
            srlimit: "3",
            format: "json",
            formatversion: "2",
          }),
          signal,
          "wikipedia",
        ),
      ),
    );
  return collect(
    result.query.search.map(async (page) => {
      const parsed = z
        .object({
          parse: z.object({
            text: z.string(),
            revid: z.number().int().positive(),
          }),
        })
        .parse(
          JSON.parse(
            await read(
              endpoint(base, {
                action: "parse",
                pageid: String(page.pageid),
                prop: "text|revid",
                format: "json",
                formatversion: "2",
                redirects: "1",
                disableeditsection: "1",
              }),
              signal,
            ),
          ),
        );
      return {
        title: page.title,
        url: endpoint("https://pl.wikipedia.org/w/index.php", {
          title: page.title,
          oldid: String(parsed.parse.revid),
        }).toString(),
        canonicalUrl: `https://pl.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
        raw_content: htmlText(parsed.parse.text),
        provider: "wikipedia",
        sourceType: "encyclopedia",
        contentScope: "text",
        publisherGroup: "wikipedia.org",
        publisher: "Wikipedia (Wikimedia Foundation)",
        notes: [
          `Artykuł encyklopedyczny, wersja ${parsed.parse.revid}. Weryfikuj również źródła pierwotne wskazane w artykule.`,
        ],
      } satisfies SearchHit;
    }),
  );
}

const actSchema = z.object({
  ELI: z.string().regex(/^(DU|MP)\/\d{4}\/\d+$/),
  title: z.string(),
  textHTML: z.boolean(),
  status: z.string().optional(),
  announcementDate: z.string().optional(),
  promulgation: z.string().optional(),
});

export async function sejm(
  query: string,
  signal: AbortSignal,
): Promise<SourceBatch> {
  const result = z.object({ items: z.array(actSchema).max(3) }).parse(
    JSON.parse(
      await read(
        endpoint("https://api.sejm.gov.pl/eli/acts/search", {
          title: query,
          limit: "3",
        }),
        signal,
        "sejm",
      ),
    ),
  );
  let partial = false;
  const hits = await Promise.all(
    result.items.map(async (act) => {
      const base = `https://api.sejm.gov.pl/eli/acts/${act.ELI}`;
      let raw = JSON.stringify(act, null, 2);
      let full = false;
      if (act.textHTML) {
        try {
          raw = htmlText(await read(new URL(`${base}/text.html`), signal));
          full = true;
        } catch {
          partial = true;
        }
      }
      return {
        title: act.title,
        url: full ? `${base}/text.html` : base,
        canonicalUrl: base,
        raw_content: raw,
        provider: "sejm",
        sourceType: "official",
        contentScope: full ? "text" : "metadata",
        publisherGroup: "gov.pl",
        publisher: "Kancelaria Sejmu RP (rejestr ELI)",
        eventPeriod: act.announcementDate
          ? { from: act.announcementDate, to: act.announcementDate }
          : null,
        // Do not confuse announcementDate (date of the act) with publication.
        published_date: act.promulgation ?? null,
        notes: [
          full
            ? "Tekst aktu z rejestru ELI. Sprawdź datę i późniejsze nowelizacje."
            : "Tylko metadane rejestru ELI; nie pobrano treści przepisów ani PDF.",
          ...(act.status ? [`Status w rejestrze: ${act.status}.`] : []),
        ],
      } satisfies SearchHit;
    }),
  );
  signal.throwIfAborted();
  return { hits, partial };
}

// arXiv requires one connection at a time, with >=3s between requests.
// Process-local: multiple deployments require a shared limiter before publishing.
const globals = globalThis as typeof globalThis & {
  prawdowidArxiv?: { tail: Promise<void>; lastStart: number };
};
const arxivQueue = (globals.prawdowidArxiv ??= {
  tail: Promise.resolve(),
  lastStart: 0,
});

async function waitForTurn(previous: Promise<void>, signal: AbortSignal) {
  signal.throwIfAborted();
  let listener: ReturnType<typeof addAbortListener> | undefined;
  try {
    await Promise.race([
      previous,
      new Promise<never>((_, reject) => {
        listener = addAbortListener(signal, () => reject(signal.reason));
      }),
    ]);
  } finally {
    listener?.[Symbol.dispose]();
  }
}

export async function arxiv(
  query: string,
  signal: AbortSignal,
): Promise<SourceBatch> {
  signal.throwIfAborted();
  const previous = arxivQueue.tail;
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  // A cancelled waiter must not let later requests overtake the active one.
  arxivQueue.tail = previous.then(() => turn);
  try {
    await waitForTurn(previous, signal);
    signal.throwIfAborted();
    const wait = Math.max(0, arxivQueue.lastStart + 3000 - Date.now());
    if (wait) await delay(wait, undefined, { signal });
    const terms = query.match(/[\p{L}\p{N}-]+/gu)?.slice(0, 10) ?? [];
    if (!terms.length) return { hits: [], partial: false };
    arxivQueue.lastStart = Date.now();
    const xml = await read(
      endpoint("https://export.arxiv.org/api/query", {
        search_query: terms.map((term) => `all:"${term}"`).join(" AND "),
        max_results: "3",
        sortBy: "relevance",
      }),
      signal,
      "arxiv",
    );
    const $ = load(xml, { xml: true });
    if (!$("feed").length) throw new Error("Invalid arXiv response");
    const hits: SearchHit[] = [];
    $("entry").each((_, node) => {
      const entry = $(node);
      const id = entry
        .children("id")
        .text()
        .trim()
        .match(/^https?:\/\/arxiv\.org\/abs\/([a-zA-Z0-9./-]+)$/)?.[1];
      if (!id || id.includes("..")) throw new Error("Invalid arXiv entry");
      hits.push({
        title: entry.children("title").text().replace(/\s+/g, " ").trim(),
        url: `https://arxiv.org/abs/${id}`,
        canonicalUrl: `https://arxiv.org/abs/${id.replace(/v\d+$/, "")}`,
        raw_content: entry.children("summary").text().trim(),
        published_date: entry.children("published").text().trim(),
        updatedAt: entry.children("updated").text().trim() || null,
        publisher: "arXiv",
        provider: "arxiv",
        sourceType: "research",
        contentScope: "abstract",
        publisherGroup: "arxiv.org",
        notes: [
          "Wyłącznie abstrakt pracy z arXiv. Obecność w repozytorium nie potwierdza recenzji naukowej ani konsensusu.",
        ],
      });
    });
    return { hits, partial: false };
  } finally {
    release();
  }
}
