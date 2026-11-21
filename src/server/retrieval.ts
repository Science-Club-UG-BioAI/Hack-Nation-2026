import type { z } from "zod";
import type {
  planSchema,
  RetrievalStatus,
  SourceProvider,
} from "@/core/contracts";
import { AppError } from "@/core/errors";
import { search } from "./providers";
import {
  allowedSourceDomains,
  isAllowedCorpusUrl,
  isAllowedSourceUrl,
} from "@/core/source-policy";
import { factCheck } from "./fact-check";
import { demagog } from "./demagog";
import { wikipedia, sejm, arxiv, type SourceBatch } from "./source-adapters";
import { corpus } from "./corpus";
import { euvsdisinfo, euvsdisinfoConfigured } from "./euvsdisinfo";
import type { ProgressListener } from "@/core/progress";

type SourceSearch = {
  provider: SourceProvider;
  requests: (() => Promise<SourceBatch>)[];
};

async function retrieveSource(
  { provider, requests }: SourceSearch,
  onProgress?: ProgressListener,
) {
  let documents = 0;
  let failures = 0;
  let partial = false;
  const unavailableArticles = new Map<string, { title: string; url: string }>();
  let remaining = requests.length;
  const report = (status: RetrievalStatus["status"] | "running") =>
    onProgress?.({ type: "source", source: { provider, documents, status } });

  const batches = await Promise.all(
    requests.map(async (run) => {
      report("running");
      try {
        const batch = await run();
        const allowed =
          provider === "corpus" ? isAllowedCorpusUrl : isAllowedSourceUrl;
        const eligible = batch.hits.filter(
          (hit) =>
            allowed(hit.url) &&
            (!hit.canonicalUrl || allowed(hit.canonicalUrl)),
        );
        documents += eligible.length;
        partial ||= batch.partial;
        for (const article of batch.unavailableArticles ?? [])
          unavailableArticles.set(article.url, article);
        return eligible;
      } catch {
        failures++;
        return [];
      } finally {
        if (--remaining > 0) report("running");
      }
    }),
  );
  let status: RetrievalStatus["status"] = documents ? "ok" : "empty";
  if (failures === requests.length) status = "error";
  else if (partial || failures) status = "partial";
  report(status);
  return {
    // Give both queries an opportunity before a publisher's document limit is reached.
    hits: Array.from(
      { length: Math.max(0, ...batches.map((batch) => batch.length)) },
      (_, index) =>
        batches.flatMap((batch) => (batch[index] ? [batch[index]] : [])),
    ).flat(),
    status: {
      provider,
      documents,
      status,
      ...(unavailableArticles.size
        ? { unavailableArticles: [...unavailableArticles.values()] }
        : {}),
    },
    failures,
  };
}

export async function retrieve(
  plan: z.infer<typeof planSchema>,
  signal: AbortSignal,
  onProgress?: ProgressListener,
) {
  const statuses: RetrievalStatus[] = [];
  const limited = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const sources: SourceSearch[] = [
    {
      provider: "corpus",
      requests: [() => corpus(plan.queries.join(" "), limited)],
    },
  ];
  for (const [provider, query, adapter, origin] of [
    ["wikipedia", plan.wikipediaQuery, wikipedia, "https://pl.wikipedia.org"],
    ["sejm", plan.sejmQuery, sejm, "https://api.sejm.gov.pl"],
    ["arxiv", plan.arxivQuery, arxiv, "https://arxiv.org"],
    [
      "euvsdisinfo",
      euvsdisinfoConfigured() ? plan.euvsdisinfoQuery : null,
      euvsdisinfo,
      "https://euvsdisinfo.eu",
    ],
  ] as const) {
    if (query && isAllowedSourceUrl(origin))
      sources.push({ provider, requests: [() => adapter(query, limited)] });
    else statuses.push({ provider, status: "not_applicable", documents: 0 });
  }
  if (plan.queries.length)
    sources.push({
      provider: "web",
      requests: plan.queries.flatMap((query) =>
        allowedSourceDomains.map((domain) => async () => ({
          hits: await search(query, limited, domain),
          partial: false,
        })),
      ),
    });
  const topics = [
    ...new Set(
      (plan.factCheckQueries?.length ? plan.factCheckQueries : plan.queries)
        .map((query) =>
          query
            .replace(/-?site:\s*\S+/giu, "")
            .trim()
            .toLocaleLowerCase("pl"),
        )
        .filter(Boolean),
    ),
  ];
  if (process.env.GOOGLE_FACTCHECK_API_KEY?.trim() && topics.length)
    sources.push({
      provider: "google_factcheck",
      requests: topics.map((query) => async () => ({
        hits: await factCheck(query, limited),
        partial: false,
      })),
    });
  if (process.env.SERPER_API_KEY?.trim() && topics.length)
    sources.push({
      provider: "demagog",
      requests: [() => demagog(topics[0], limited)],
    });
  else if (topics.length)
    statuses.push({
      provider: "demagog",
      status: "not_configured",
      documents: 0,
    });

  for (const source of statuses) onProgress?.({ type: "source", source });
  // Promise.all preserves source and query priority regardless of completion order.
  const results = await Promise.all(
    sources.map((source) => retrieveSource(source, onProgress)),
  );
  signal.throwIfAborted();
  // Search results address the current claim; broad catalog matches are supplementary.
  const hits = results
    .toSorted(
      (a, b) =>
        (a.status.provider === "google_factcheck"
          ? 2
          : Number(a.status.provider === "corpus")) -
        (b.status.provider === "google_factcheck"
          ? 2
          : Number(b.status.provider === "corpus")),
    )
    .flatMap((result) => result.hits);
  if (!hits.length && results.some((result) => result.failures > 0))
    throw new AppError(
      "PROVIDER_ERROR",
      "Nie udało się połączyć z usługami wyszukiwania źródeł. Spróbuj ponownie.",
      502,
      true,
    );
  const downloaded = new Set(
    hits
      .filter(
        (hit) => hit.contentScope !== "metadata" && hit.raw_content?.trim(),
      )
      .map((hit) => hit.url),
  );
  return {
    hits,
    statuses: statuses.concat(
      results.map(({ status }) => {
        if (!status.unavailableArticles) return status;
        return {
          ...status,
          unavailableArticles: status.unavailableArticles.filter(
            ({ url }) => !downloaded.has(url),
          ),
        };
      }),
    ),
  };
}
