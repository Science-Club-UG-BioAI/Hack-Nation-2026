import { load } from "cheerio";
import type { Document } from "@/core/contracts";
import { readBoundedText } from "./read-body";
import { cachedSearch } from "./search-cache";

function validDate(value: string | undefined): string | null {
  if (!value) return null;
  const polish = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  const date = polish ? `${polish[3]}-${polish[2]}-${polish[1]}` : value;
  return Number.isFinite(Date.parse(date)) ? date : null;
}

export function publicationDateFromHtml(html: string): string | null {
  const $ = load(html);
  return (
    validDate($('meta[property="article:published_time"]').attr("content")) ??
    validDate($('meta[name="date"]').attr("content")) ??
    validDate($('time[itemprop="datePublished"]').attr("datetime")) ??
    validDate($("main .event-date").first().text()) ??
    validDate(
      $(".dg-post__info")
        .first()
        .text()
        .match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0],
    )
  );
}

// Only enrich the selected documents; missing metadata never discards their text.
export async function enrichPublicationDates(
  documents: Document[],
  signal: AbortSignal,
) {
  const limited = AbortSignal.any([signal, AbortSignal.timeout(6_000)]);
  await Promise.all(
    documents.slice(0, 10).map(async (doc) => {
      if (doc.publishedAt) return;
      const url = new URL(doc.url);
      try {
        if (
          url.protocol === "https:" &&
          !url.port &&
          !url.username &&
          !url.password &&
          (url.hostname === "www.gov.pl" ||
            (/^(?:www\.)?demagog\.org\.pl$/.test(url.hostname) &&
              /^\/(?:na-biezaco|wypowiedzi|fake_news)\/[^/]+\/?$/.test(
                url.pathname,
              )))
        ) {
          const { value } = await cachedSearch(
            `publication-html-v1:${url.href}`,
            limited,
            async () => {
              const response = await fetch(url, {
                signal: limited,
                redirect: "error",
                cache: "no-store",
              });
              if (
                !response.ok ||
                !response.body ||
                !response.headers.get("content-type")?.includes("text/html")
              ) {
                await response.body?.cancel();
                return null;
              }
              const html = await readBoundedText(
                response.body,
                3_000_000,
                new Error("Source too large"),
                limited,
              );
              return publicationDateFromHtml(html);
            },
            60 * 60_000,
            (date) => date !== null,
          );
          doc.publishedAt = value;
        }
      } catch {
        // Leave the date explicitly unknown when the source cannot supply it.
      }
    }),
  );
  signal.throwIfAborted();
}
