import type { z } from "zod";
import type {
  planSchema,
  RetrievalStatus,
  SourceProvider,
} from "@/core/contracts";
import { interleave } from "@/core/interleave";
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
import {
  prepareDocuments,
  publisherGroup,
  type SearchHit,
} from "@/core/evidence";
import { guardDocuments } from "@/core/untrusted";

type SourceSearch = {
  provider: SourceProvider;
  requests: (() => Promise<SourceBatch>)[];
};

// Always keep both the original claim and the counter/context query. Only the
// domain fan-out is conditional; this is a retrieval budget, never a verdict.
async function budgetedWebSearch(
  queries: string[],
  signal: AbortSignal,
  onProgress?: ProgressListener,
): Promise<SourceBatch> {
  const batches: SearchHit[][] = [];
  let failures = 0;
  let attempted = 0;
  const run = async (
    query: string,
    domain?: (typeof allowedSourceDomains)[number],
  ) => {
    attempted++;
    try {
      return (await search(query, signal, domain)).filter(
        (hit) =>
          isAllowedSourceUrl(hit.url) &&
          (!hit.canonicalUrl || isAllowedSourceUrl(hit.canonicalUrl)),
      );
    } catch {
      failures++;
      return [];
    }
  };
  batches.push(
    ...(await Promise.all(queries.slice(0, 2).map((query) => run(query)))),
  );
  const usable = guardDocuments(
    prepareDocuments(
      [...interleave(batches)].filter((hit) => hit.contentScope !== "metadata"),
      queries[0] ?? "",
      new Date().toISOString(),
    ),
  ).documents;
  const groups = new Set(usable.map((doc) => publisherGroup(doc.url)));
  const needsMore = usable.length < 2 || groups.size < 2;
  if (needsMore && !signal.aborted) {
    onProgress?.({
      type: "source",
      source: {
        provider: "web",
        status: "running",
        documents: batches.flat().length,
      },
    });
    const missing = (["gov.pl", "demagog.org.pl", "euvsdisinfo.eu"] as const)
      .filter((domain) => !groups.has(domain))
      .slice(0, 2);
    batches.push(
      ...(await Promise.all(
        missing.map((domain, index) =>
          run(queries[index % queries.length], domain),
        ),
      )),
    );
  }
  if (failures === attempted)
    throw new AppError(
      "PROVIDER_ERROR",
      "Nie udało się pobrać wyników wyszukiwania.",
      502,
      true,
    );
  return {
    hits: [...interleave(batches)],
    partial: failures > 0 || (needsMore && signal.aborted),
  };
}

async function retrieveSource(
  { provider, requests }: SourceSearch,
  onProgress?: ProgressListener,
) {
  const allowed =
    provider === "corpus" ? isAllowedCorpusUrl : isAllowedSourceUrl;
  let documents = 0;
  let remaining = requests.length;
  const report = (status: RetrievalStatus["status"] | "running") =>
    onProgress?.({ type: "source", source: { provider, documents, status } });

  const outcomes = await Promise.allSettled(
    requests.map(async (run) => {
      report("running");
      try {
        const batch = await run();
        const hits = batch.hits.filter(
          (hit) =>
            allowed(hit.url) &&
            (!hit.canonicalUrl || allowed(hit.canonicalUrl)),
        );
        documents += hits.length;
        return { ...batch, hits };
      } finally {
        if (--remaining > 0) report("running");
      }
    }),
  );
  const batches = outcomes.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );
  const failures = requests.length - batches.length;
  const partial = failures > 0 || batches.some((batch) => batch.partial);
  const unavailableArticles = new Map(
    batches.flatMap((batch) =>
      (batch.unavailableArticles ?? []).map(
        (article) => [article.url, article] as const,
      ),
    ),
  );
  let status: RetrievalStatus["status"] = documents ? "ok" : "empty";
  if (failures === requests.length) status = "error";
  else if (partial) status = "partial";
  report(status);
  return {
    hits: [...interleave(batches.map(({ hits }) => hits))],
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

function sourcePriority(provider: SourceProvider) {
  if (provider === "google_factcheck") return 2;
  if (provider === "corpus") return 1;
  return 0;
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
      requests: [() => budgetedWebSearch(plan.queries, limited, onProgress)],
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
        sourcePriority(a.status.provider) - sourcePriority(b.status.provider),
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
