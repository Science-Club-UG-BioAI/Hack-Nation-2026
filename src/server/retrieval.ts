import type { z } from "zod";
import type {
  planSchema,
  RetrievalStatus,
  SourceProvider,
} from "@/core/contracts";
import { AppError } from "@/core/errors";
import { search } from "./providers";
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
  let remaining = requests.length;
  const report = (status: RetrievalStatus["status"] | "running") =>
    onProgress?.({ type: "source", source: { provider, documents, status } });

  const batches = await Promise.all(
    requests.map(async (run) => {
      report("running");
      try {
        const batch = await run();
        documents += batch.hits.length;
        partial ||= batch.partial;
        return batch.hits;
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
    hits: batches.flat(),
    status: { provider, documents, status },
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
  for (const [provider, query, adapter] of [
    ["wikipedia", plan.wikipediaQuery, wikipedia],
    ["sejm", plan.sejmQuery, sejm],
    ["arxiv", plan.arxivQuery, arxiv],
    [
      "euvsdisinfo",
      euvsdisinfoConfigured() ? plan.euvsdisinfoQuery : null,
      euvsdisinfo,
    ],
  ] as const) {
    if (query)
      sources.push({ provider, requests: [() => adapter(query, limited)] });
    else statuses.push({ provider, status: "not_applicable", documents: 0 });
  }
  if (plan.queries.length)
    sources.push({
      provider: "web",
      requests: plan.queries.map((query) => async () => ({
        hits: await search(query, limited),
        partial: false,
      })),
    });

  for (const source of statuses) onProgress?.({ type: "source", source });
  // Promise.all preserves source and query priority regardless of completion order.
  const results = await Promise.all(
    sources.map((source) => retrieveSource(source, onProgress)),
  );
  signal.throwIfAborted();
  const hits = results.flatMap((result) => result.hits);
  if (!hits.length && results.some((result) => result.failures > 0))
    throw new AppError(
      "PROVIDER_ERROR",
      "Nie udało się połączyć z usługami wyszukiwania źródeł. Spróbuj ponownie.",
      502,
      true,
    );
  return {
    hits,
    statuses: statuses.concat(results.map((result) => result.status)),
  };
}
