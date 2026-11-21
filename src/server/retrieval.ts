import type { z } from "zod";
import type {
  planSchema,
  RetrievalStatus,
  SourceProvider,
} from "@/core/contracts";
import type { SearchHit } from "@/core/evidence";
import { AppError } from "@/core/errors";
import { search } from "./providers";
import { wikipedia, sejm, arxiv, type SourceBatch } from "./source-adapters";
import { corpus } from "./corpus";
import { euvsdisinfo, euvsdisinfoConfigured } from "./euvsdisinfo";
import type { ProgressListener } from "@/core/progress";

export async function retrieve(
  plan: z.infer<typeof planSchema>,
  signal: AbortSignal,
  onProgress?: ProgressListener,
) {
  const tasks: { provider: SourceProvider; run: () => Promise<SourceBatch> }[] =
    [];
  const statuses: RetrievalStatus[] = [];
  const limited = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  tasks.push({
    provider: "corpus",
    run: () => corpus(plan.queries.join(" "), limited),
  });
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
    if (query) tasks.push({ provider, run: () => adapter(query, limited) });
    else statuses.push({ provider, status: "not_applicable", documents: 0 });
  }
  // Direct material first, then diverse web results; prepareDocuments deduplicates.
  for (const query of plan.queries)
    tasks.push({
      provider: "web",
      run: async () => ({ hits: await search(query, limited), partial: false }),
    });
  for (const source of statuses) onProgress?.({ type: "source", source });
  const completed = new Map<
    SourceProvider,
    { count: number; documents: number; successes: number; partial: boolean }
  >();
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      onProgress?.({
        type: "source",
        source: {
          provider: task.provider,
          status: "running",
          documents: completed.get(task.provider)?.documents ?? 0,
        },
      });
      let batch: SourceBatch | undefined;
      try {
        batch = await task.run();
        return batch;
      } finally {
        const state = completed.get(task.provider) ?? {
          count: 0,
          documents: 0,
          successes: 0,
          partial: false,
        };
        state.count++;
        state.documents += batch?.hits.length ?? 0;
        state.successes += batch ? 1 : 0;
        state.partial ||= !batch || batch.partial;
        completed.set(task.provider, state);
        onProgress?.({
          type: "source",
          source: {
            provider: task.provider,
            documents: state.documents,
            status:
              state.count <
              tasks.filter((t) => t.provider === task.provider).length
                ? "running"
                : !state.successes
                  ? "error"
                  : state.partial
                    ? "partial"
                    : state.documents
                      ? "ok"
                      : "empty",
          },
        });
      }
    }),
  );
  signal.throwIfAborted();
  if (
    results.every(
      (result) =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && !result.value.hits.length),
    ) &&
    results.some((result) => result.status === "rejected")
  )
    throw new AppError(
      "PROVIDER_ERROR",
      "Nie udało się połączyć z usługami wyszukiwania źródeł. Spróbuj ponownie.",
      502,
      true,
    );
  const hits: SearchHit[] = [];
  for (const provider of [
    "corpus",
    "wikipedia",
    "sejm",
    "arxiv",
    "euvsdisinfo",
    "web",
  ] as const) {
    const own = results.filter(
      (_, index) => tasks[index].provider === provider,
    );
    if (!own.length) continue;
    const batches = own.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const found = batches.flatMap((batch) => batch.hits);
    hits.push(...found);
    const failed =
      own.length !== batches.length || batches.some((batch) => batch.partial);
    statuses.push({
      provider,
      documents: found.length,
      status: !batches.length
        ? "error"
        : failed
          ? "partial"
          : found.length
            ? "ok"
            : "empty",
    });
  }
  return { hits, statuses };
}
