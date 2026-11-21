import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  benchmarkMetrics,
  benchmarkThresholds as thresholds,
  benchmarkGates,
  findingCoverageForResult,
  sameVerificationSnapshot,
  isCompleteRun,
} from "../src/core/benchmark.ts";

import { reviewRunCitations } from "./benchmark-review.mjs";

const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: npm run benchmark:evaluate -- reports/benchmark/RUN");
const source = await readFile(resolve(directory, "results.json"), "utf8");
const run = JSON.parse(source);
const resultSha256 = createHash("sha256").update(source).digest("hex");
const outputs = new Map(run.outputs.map((output) => [output.id, output]));
if (
  outputs.size !== run.outputs.length ||
  new Set(run.rows.map((r) => r.id)).size !== run.rows.length
)
  throw new Error("Duplicate case IDs");
if (outputs.size !== run.rows.length)
  throw new Error("Benchmark rows and outputs must cover the same cases");
// Recompute both runs by the same protocol without changing their saved results.
const rows = run.rows.map((row) => {
  const output = outputs.get(row.id);
  if (!output) throw new Error(`Missing output for ${row.id}`);
  return {
    ...row,
    findingCoverage: findingCoverageForResult(output.result),
    channelMatch:
      row.channelMatch === null
        ? null
        : Boolean(output.channelResult?.messages?.length) &&
          sameVerificationSnapshot(output.result, output.channelResult?.result),
  };
});
const complete = isCompleteRun(run);
const metrics = benchmarkMetrics(rows);
const citationReview = await reviewRunCitations(directory, run, resultSha256);
const gates = benchmarkGates(metrics, citationReview, complete);
const failures = rows
  .filter(
    (row) =>
      row.actual !== row.expected ||
      row.actualStatus !== row.expectedStatus ||
      row.channelMatch !== true,
  )
  .map((row) => ({
    id: row.id,
    expected: row.expected,
    actual: row.actual,
    status: row.actualStatus,
    code: outputs.get(row.id).result.code ?? null,
    channelMatch: row.channelMatch,
  }));
const summary = {
  generatedAt: new Date().toISOString(),
  resultSha256,
  datasetSha256: run.datasetSha256,
  complete,
  plannedCases: run.plannedCases ?? 30,
  executedCases: rows.length,
  unexecuted: run.unexecuted ?? [],
  interruptedReason: run.interruptedReason ?? null,
  thresholds,
  gates,
  metrics,
  citationReview,
  failures,
  limitations: [
    "Public development set, not an independent hidden jury set. Source text can drift between runs.",
    "Citation coverage measures mapped published findings, not independently judged entailment or atomicity.",
    "Cross-channel comparison checks the entire result snapshot in the same session. Cache delivery time is not inference latency.",
    "HTTP errors and rejected assessments remain in quality/availability denominators. No assertion means no coverage credit.",
    "Only 3 public input attacks; report controlled source attacks separately. No broad population-level resistance claim.",
    "Cost of 100 tests and independent citation correctness remain unmeasured unless an appropriate review is attached.",
  ],
};
await writeFile(
  resolve(directory, "summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { complete, executedCases: rows.length, gates, metrics, failures },
    null,
    2,
  ),
);
