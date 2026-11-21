import { load } from "cheerio";
import type { Document } from "@/core/contracts";
import { safeUrl } from "@/core/evidence";
import { readBoundedText } from "./read-body";
import { searchPublicationMetadata } from "./providers";

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
    validDate($("main .event-date").first().text())
  );
}

// Only enrich the selected documents; missing metadata never discards their text.
export async function enrichPublicationDates(
  documents: Document[],
  signal: AbortSignal,
) {
  const limited = AbortSignal.any([signal, AbortSignal.timeout(6_000)]);
  await Promise.all(
    documents.map(async (doc) => {
      if (doc.publishedAt) return;
      const url = new URL(doc.url);
      try {
        if (
          url.protocol === "https:" &&
          url.hostname === "www.gov.pl" &&
          !url.port
        ) {
          const response = await fetch(url, {
            signal: limited,
            redirect: "error",
            cache: "no-store",
          });
          if (!response.ok || !response.body) return;
          const html = await readBoundedText(
            response.body,
            3_000_000,
            new Error("Source too large"),
            limited,
          );
          doc.publishedAt = publicationDateFromHtml(html);
        } else if (
          /^(?:www\.)?demagog\.org\.pl$/.test(url.hostname) &&
          /^\/(?:na-biezaco|wypowiedzi|fake_news)\/[^/]+\/?$/.test(url.pathname)
        ) {
          const hits = await searchPublicationMetadata(
            doc.title,
            doc.url,
            limited,
          );
          const identity = safeUrl(doc.url)?.replace(/\/$/, "");
          const same = hits.find(
            (hit) => safeUrl(hit.url)?.replace(/\/$/, "") === identity,
          );
          doc.publishedAt = validDate(same?.published_date ?? undefined);
          if (doc.publishedAt)
            doc.notes = [
              ...(doc.notes ?? []),
              "Data publikacji według metadanych wyszukiwarki.",
            ];
        }
      } catch {
        // Leave the date explicitly unknown when the source cannot supply it.
      }
    }),
  );
  signal.throwIfAborted();
}
