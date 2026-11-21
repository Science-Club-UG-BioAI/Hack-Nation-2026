import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  benchmarkMetrics,
  benchmarkThresholds as thresholds,
  isCompleteRun,
  benchmarkGates,
} from "../src/core/benchmark.ts";
import { reviewRunCitations } from "./benchmark-review.mjs";
import { corpusStats } from "./check-corpus.mjs";
const latestText = await readFile(
  "reports/benchmark/latest/results.json",
  "utf8",
);
const latest = JSON.parse(latestText),
  initial = JSON.parse(
    await readFile("reports/benchmark/initial/results.json", "utf8"),
  );
const controlled = JSON.parse(
  await readFile("reports/benchmark/controlled/results.json", "utf8"),
);
const metrics = benchmarkMetrics(latest.rows);
const resultHash = createHash("sha256").update(latestText).digest("hex");
const citationReview = await reviewRunCitations(
  "reports/benchmark/latest",
  latest,
  resultHash,
);
const complete = isCompleteRun(latest);
// The historical report's median gate refers to successful responses.
const {
  successfulMedianMs,
  cost100: _cost100,
  ...gates
} = benchmarkGates(metrics, citationReview, complete);
gates.medianMs = successfulMedianMs;
const summary = {
  generatedAt: new Date().toISOString(),
  latestResultSha256: resultHash,
  thresholds,
  gates,
  complete,
  metrics,
  citationReview,
  initialMetrics: benchmarkMetrics(initial.rows),
  corpus: corpusStats(
    JSON.parse(await readFile("data/corpus/catalog.json", "utf8")),
  ),
  controlled: {
    scope: controlled.scope,
    cases: controlled.rows.length,
    passed: controlled.rows.filter((r) => r.passed).length,
    conflict: controlled.rows
      .filter((r) => r.conflict)
      .map((r) => ({ id: r.id, passed: r.passed })),
    sourceInjection: controlled.rows
      .filter((r) => r.injection)
      .map((r) => ({ id: r.id, passed: r.passed })),
    eventLoggingVerified: false,
  },
  failureCases: latest.rows
    .filter(
      (r) => r.actual !== r.expected || r.actualStatus !== r.expectedStatus,
    )
    .map((r) => ({
      id: r.id,
      expected: r.expected,
      actual: r.actual,
      status: r.actualStatus,
      http: r.httpStatus,
    })),
  limitations: [
    "Public developer-authored labels, not a hidden test or independent expert benchmark.",
    "Fact cases focus on Polish EU/NATO history and currency; no broad scientific/general-news accuracy claim.",
    "Latency includes planning, live retrieval, model calls, quote validation and audit until HTTP JSON; excludes human typing and browser rendering.",
    "All HTTP failures count against quality and availability. Successful-response latency is also reported to avoid falsely passing speed through fast failures.",
    "Cross-channel probe reuses the documented same-session snapshot; no claim of deterministic independent generations.",
    "No independent semantic citation review or 100-test billing record attached.",
    "Source attack fixtures use controlled planning/retrieval and cannot replace end-to-end live latency.",
    "A few source-injection trials do not establish a robust population-level attack resistance rate.",
  ],
};
await writeFile(
  "reports/benchmark/summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      complete: summary.complete,
      gates,
      metrics,
      corpus: summary.corpus,
      controlled: summary.controlled,
    },
    null,
    2,
  ),
);
