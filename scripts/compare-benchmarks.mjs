import { readFile, writeFile } from "node:fs/promises";
import { benchmarkMetrics } from "../src/core/benchmark.ts";
const before = JSON.parse(
  await readFile(
    process.env.COMPARE_BEFORE ||
      "reports/benchmark/before-hardening/results.json",
    "utf8",
  ),
);
const after = JSON.parse(
  await readFile(
    process.env.COMPARE_AFTER ||
      "reports/benchmark/after-hardening/results.json",
    "utf8",
  ),
);
const controlled = await Promise.all(
  [
    process.env.COMPARE_CONTROLLED_BEFORE || "controlled-before-hardening",
    process.env.COMPARE_CONTROLLED_AFTER || "controlled-after-hardening",
  ].map(async (dir) => {
    try {
      return JSON.parse(
        await readFile(`reports/benchmark/${dir}/results.json`, "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }),
);
const summarizeControlled = (run) =>
  run && {
    datasetVersion: run.datasetVersion,
    passed: run.rows.filter((row) => row.passed).length,
    total: run.rows.length,
    injection: {
      passed: run.rows.filter((row) => row.injection && row.passed).length,
      total: run.rows.filter((row) => row.injection).length,
    },
    failures: run.rows
      .filter((row) => !row.passed)
      .map((row) => ({
        id: row.id,
        status: row.result.status,
        code: row.result.code ?? null,
      })),
  };
if (before.datasetSha256 !== after.datasetSha256)
  throw new Error("Cannot compare different reference datasets");
for (const run of [before, after]) {
  if (run.unexecuted?.length || run.rows.length !== (run.plannedCases ?? 30))
    throw new Error("Cannot compare incomplete case sets");
  if (new Set(run.rows.map((row) => row.id)).size !== run.rows.length)
    throw new Error("Duplicate benchmark case IDs");
}
if (before.rows.length !== after.rows.length)
  throw new Error("Cannot compare incomplete case sets");
const old = new Map(before.rows.map((row) => [row.id, row]));
const cases = after.rows.map((row) => {
  const baseline = old.get(row.id);
  if (
    !baseline ||
    baseline.expected !== row.expected ||
    baseline.expectedStatus !== row.expectedStatus
  )
    throw new Error("Gold labels changed");
  const passed = (x) =>
    x.actual === x.expected && x.actualStatus === x.expectedStatus;
  return {
    id: row.id,
    expected: row.expected,
    before: {
      actual: baseline.actual,
      status: baseline.actualStatus,
      ms: baseline.durationMs,
    },
    after: { actual: row.actual, status: row.actualStatus, ms: row.durationMs },
    improved: !passed(baseline) && passed(row),
    regressed: passed(baseline) && !passed(row),
    unchanged: passed(baseline) === passed(row),
  };
});
const b = benchmarkMetrics(before.rows),
  a = benchmarkMetrics(after.rows);
const paired = cases.filter(
  (c) =>
    c.expected !== null &&
    c.before.status === "completed" &&
    c.after.status === "completed",
);
const result = {
  datasetSha256: after.datasetSha256,
  complete: before.rows.length === 30 && after.rows.length === 30,
  protocol: {
    modelsUnchanged:
      before.model === after.model && before.fallback === after.fallback,
    intervalUnchanged: before.intervalMs === after.intervalMs,
    sources:
      "Live sources may change; neither run is a replay of source snapshots.",
  },
  before: b,
  after: a,
  delta: {
    macroF1: a.macroF1 - b.macroF1,
    medianMs: a.latency.medianMs - b.latency.medianMs,
    citationCoverage: a.citationCoverage.value - b.citationCoverage.value,
  },
  improved: cases.filter((c) => c.improved).map((c) => c.id),
  regressed: cases.filter((c) => c.regressed).map((c) => c.id),
  cases,
  pairedCompletedDiagnostic: {
    note: "Diagnostic only: both runs completed a classification. The headline metrics retain every failure.",
    cases: paired.map((c) => c.id),
    beforeCorrect: paired.filter((c) => c.before.actual === c.expected).length,
    afterCorrect: paired.filter((c) => c.after.actual === c.expected).length,
    total: paired.length,
  },
  controlledSources: {
    note: "Separate controlled planning/retrieval, real model assessment and audit; not full online latency.",
    before: summarizeControlled(controlled[0]),
    after: summarizeControlled(controlled[1]),
  },
  limitations: [
    "One before/after run on the development set; not an independent hidden evaluation or causal estimate.",
    "Service availability and source drift affect both quality and timing. Errors remain in denominators.",
    "Input-injection completion includes correct factual outcome, not merely failure to execute the attack.",
    "Category is derived in code from a model-provided evidence basis, whose semantic adequacy is still fallible.",
  ],
};
await writeFile(
  process.env.COMPARE_OUTPUT || "reports/benchmark/hardening-comparison.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      complete: result.complete,
      delta: result.delta,
      improved: result.improved,
      regressed: result.regressed,
      before: b,
      after: a,
    },
    null,
    2,
  ),
);
