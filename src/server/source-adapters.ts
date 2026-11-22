import { load } from "cheerio";
import { z } from "zod";
import type { SearchHit } from "@/core/evidence";
import { readBoundedText } from "./read-body";
import { startCall } from "./config";

const USER_AGENT =
  "Prawdowid/0.2 (https://github.com/Science-Club-UG-BioAI/Hack-Nation-2026)";
export type SourceBatch = {
  hits: SearchHit[];
  partial: boolean;
  unavailableArticles?: { title: string; url: string }[];
};

// Fixed API hosts only. Bound the downloaded body before parsing HTML or JSON.
async function read(
  url: URL,
  signal: AbortSignal,
  searchProvider?: "sejm",
): Promise<string> {
  if (searchProvider) startCall(searchProvider).costUsd = 0;
  const response = await fetch(url, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/html",
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
