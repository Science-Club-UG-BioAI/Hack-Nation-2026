import catalog from "../../data/corpus/catalog.json";
import { isAllowedSourceUrl } from "@/core/source-policy";
import type { SearchHit } from "@/core/evidence";
import { readBoundedText } from "./read-body";
import { htmlText, type SourceBatch } from "./source-adapters";

const tokens = (value: string) => [
  ...new Set(
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]{4,}/gu) ?? [],
  ),
];
const indexedRecords = catalog.records
  .filter((record) => isAllowedSourceUrl(record.url))
  .map((record) => ({
    record,
    words: tokens(record.title + " " + new URL(record.url).pathname),
  }));

export function searchCorpus(query: string) {
  const terms = tokens(query);
  return indexedRecords
    .map(({ record, words }) => ({
      record,
      score: words.filter((word) =>
        terms.some(
          (term) =>
            word === term ||
            (term.length >= 6 && word.startsWith(term.slice(0, -2))),
        ),
      ).length,
    }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
    .slice(0, 3)
    .map((item) => item.record);
}
export async function corpus(
  query: string,
  signal: AbortSignal,
): Promise<SourceBatch> {
  const selected = searchCorpus(query);
  const results = await Promise.allSettled(
    selected.map(async (record): Promise<SearchHit> => {
      // URLs come only from the audited catalog, never from user/model input. No redirects.
      const response = await fetch(record.url, {
        signal,
        redirect: "error",
        cache: "no-store",
        headers: {
          "User-Agent": "Prawdowid/0.3 corpus retrieval",
          Accept: "text/html",
        },
      });
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error("Corpus source unavailable");
      const raw = htmlText(
        await readBoundedText(
          response.body,
          3_000_000,
          new Error("Source too large"),
          signal,
        ),
      );
      if (raw.length < 80) throw new Error("No usable corpus text");
      return {
        title: record.title,
        url: record.url,
        raw_content: raw,
        published_date: record.publishedAt,
        publisher: record.publisher,
        publisherIsDomain: record.publisherIsDomain,
        updatedAt: record.updatedAt,
        eventPeriod: record.eventPeriod,
        provider: "corpus",
        sourceType:
          record.type === "official"
            ? "official"
            : record.type === "encyclopedia"
              ? "encyclopedia"
              : "web",
        contentScope: "text",
        notes: [
          `Korpus: ${record.id}; wydawca: ${record.publisher}. Tekst pobrano ponownie przy analizie.`,
          ...(record.publishedAt
            ? []
            : [
                "Nie ustalono daty publikacji; nie jest zastępowana datą pobrania.",
              ]),
        ],
      };
    }),
  );
  const hits = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  return {
    hits,
    partial: results.some((result) => result.status === "rejected"),
  };
}
