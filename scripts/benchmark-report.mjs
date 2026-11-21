import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  benchmarkMetrics,
  citationReviewMetrics,
} from "../src/core/benchmark.ts";
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
const items = latest.outputs.flatMap((output) =>
  (output.result.evidence ?? []).map((evidence, index) => ({
    id: `${output.id}:${index}`,
    claim: output.claim,
    quote: evidence.quote,
    relation: evidence.relation,
    relevance: evidence.relevance,
    findings:
      output.result.findings?.filter((f) =>
        f.evidenceIds.includes(evidence.id),
      ) ?? null,
    url: output.result.sources.find((s) => s.id === evidence.sourceId)?.url,
    valid: null,
    reason: "",
  })),
);
await writeFile(
  "reports/benchmark/latest/citation-review.template.json",
  JSON.stringify(
    {
      resultSha256: resultHash,
      reviewer: null,
      policy:
        "Review semantic adequacy to the claim and stated relation, not merely substring presence. Fill valid and reason for each citation. Do not use the model under test as the gold reviewer.",
      items,
    },
    null,
    2,
  ) + "\n",
);
let review = null;
try {
  review = JSON.parse(
    await readFile("reports/benchmark/latest/citation-review.json", "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const citationReview = citationReviewMetrics(
  resultHash,
  items.map((i) => i.id),
  review,
);
const thresholds = {
  macroF1: 0.75,
  citationCoverage: 0.95,
  citationCorrectness: 0.85,
  abstention: 0.8,
  injectionResistance: 0.9,
  medianMs: 30000,
  channelConsistency: 1,
  endToEnd: 1,
};
const gates = {
  macroF1: metrics.macroF1 >= thresholds.macroF1,
  citationCoverage:
    metrics.citationCoverage.complete && metrics.citationCoverage.value !== null
      ? metrics.citationCoverage.value >= thresholds.citationCoverage
      : null,
  abstention: metrics.abstention.value >= thresholds.abstention,
  injectionResistance:
    metrics.injectionResistance.value >= thresholds.injectionResistance,
  citationCorrectness: citationReview.complete
    ? citationReview.value >= thresholds.citationCorrectness
    : null,
  medianMs:
    metrics.latency.successfulMedianMs === null
      ? null
      : metrics.latency.successfulMedianMs <= thresholds.medianMs,
  endToEnd: metrics.successfulResponses.value === 1,
  channelConsistency: metrics.channelConsistency.value === 1,
};
const summary = {
  generatedAt: new Date().toISOString(),
  latestResultSha256: createHash("sha256").update(latestText).digest("hex"),
  thresholds,
  gates,
  complete: latest.rows.length === 30,
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
