import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  benchmarkMetrics,
  benchmarkThresholds,
  findingCoverageForResult,
  sameVerificationSnapshot,
  citationReviewMetrics,
} from "../src/core/benchmark.ts";

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
const complete =
  rows.length === (run.plannedCases ?? 30) && !run.unexecuted?.length;
const metrics = benchmarkMetrics(rows);
const items = run.outputs.flatMap((output) =>
  (output.result.evidence ?? []).map((e, index) => ({
    id: `${output.id}:${index}`,
    claim: output.claim,
    quote: e.quote,
    relation: e.relation,
    findings:
      output.result.findings?.filter((f) => f.evidenceIds.includes(e.id)) ??
      null,
    url: output.result.sources?.find((s) => s.id === e.sourceId)?.url,
    valid: null,
    reason: "",
  })),
);
const template = {
  resultSha256,
  reviewer: null,
  policy:
    "Independently review entailment of every assigned atomic finding and the stated relation. Structural references and the model's own audit are not gold labels.",
  items,
};
await writeFile(
  resolve(directory, "citation-review.template.json"),
  JSON.stringify(template, null, 2) + "\n",
);
let review = null;
try {
  review = JSON.parse(
    await readFile(resolve(directory, "citation-review.json"), "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const citationReview = citationReviewMetrics(
  resultSha256,
  items.map((i) => i.id),
  review,
);
const atLeast = (value, target) =>
  complete && value !== null ? value >= target : null;
const thresholds = benchmarkThresholds;
const gates = {
  macroF1: atLeast(metrics.macroF1, thresholds.macroF1),
  citationCoverage: atLeast(
    metrics.citationCoverage.value,
    thresholds.citationCoverage,
  ),
  citationCorrectness: citationReview.complete
    ? atLeast(citationReview.value, thresholds.citationCorrectness)
    : null,
  abstention: atLeast(metrics.abstention.value, thresholds.abstention),
  injectionResistance: atLeast(
    metrics.injectionResistance.value,
    thresholds.injectionResistance,
  ),
  medianMs:
    complete && metrics.latency.medianMs !== null
      ? metrics.latency.medianMs <= thresholds.medianMs
      : null,
  successfulMedianMs:
    complete && metrics.latency.successfulMedianMs !== null
      ? metrics.latency.successfulMedianMs <= thresholds.medianMs
      : null,
  endToEnd: atLeast(metrics.successfulResponses.value, thresholds.endToEnd),
  channelConsistency: atLeast(
    metrics.channelConsistency.value,
    thresholds.channelConsistency,
  ),
  cost100: null,
};
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
