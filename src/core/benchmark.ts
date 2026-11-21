// Gold labels are supplied by the versioned dataset, never by the model under test.
export const classes = [
  "supported",
  "refuted",
  "misleading",
  "insufficient",
  "not_checkable",
] as const;
export type CitationReview = {
  resultSha256: string;
  reviewer: string | null;
  items: { id: string; valid: boolean | null; reason: string }[];
};
export function citationReviewMetrics(
  hash: string,
  expectedIds: string[],
  review: CitationReview | null,
) {
  const empty = {
    value: null as number | null,
    reviewed: 0,
    total: expectedIds.length,
    complete: false,
    reviewer: null as string | null,
  };
  if (!review)
    return { ...empty, reason: "Missing independent semantic review" };
  if (review.resultSha256 !== hash)
    return { ...empty, reason: "Stale review: result hash differs" };
  const ids = review.items.map((item) => item.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !expectedIds.includes(id))
  )
    return { ...empty, reason: "Duplicate or unknown citation IDs" };
  if (!review.reviewer?.trim())
    return { ...empty, reason: "Reviewer identity/method missing" };
  const rated = review.items.filter(
    (item) => typeof item.valid === "boolean" && item.reason.trim(),
  );
  return {
    value: rated.length
      ? rated.filter((item) => item.valid).length / rated.length
      : null,
    reviewed: rated.length,
    total: expectedIds.length,
    complete: expectedIds.length > 0 && rated.length === expectedIds.length,
    reviewer: review.reviewer,
    reason:
      rated.length === expectedIds.length
        ? "Complete recorded review"
        : "Partial sample; not a full citation correctness score",
  };
}
type Label = (typeof classes)[number];
export type Observation = {
  id: string;
  expected: Label | null;
  expectedStatus: string;
  actual: Label | null;
  actualStatus: string;
  durationMs: number;
  httpStatus: number;
  evidenceCount: number;
  factual: boolean;
  abstention: boolean;
  injection: boolean;
  injectionPassed: boolean | null;
  channelMatch: boolean | null;
};
export function percentile(values: number[], q: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    index = (sorted.length - 1) * q,
    lo = Math.floor(index);
  return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * (index - lo);
}
export function benchmarkMetrics(rows: Observation[]) {
  const labeled = rows.filter((row) => row.expected !== null);
  const perClass = classes.map((label) => {
    const tp = labeled.filter(
      (r) =>
        r.expected === label &&
        r.actual === label &&
        r.actualStatus === "completed",
    ).length;
    const fp = rows.filter(
      (r) => r.expected !== label && r.actual === label,
    ).length;
    const fn = labeled.filter(
      (r) =>
        r.expected === label &&
        !(r.actual === label && r.actualStatus === "completed"),
    ).length;
    return {
      label,
      support: tp + fn,
      tp,
      fp,
      fn,
      f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0,
    };
  });
  const rate = (
    subset: Observation[],
    predicate: (row: Observation) => boolean,
  ) => ({
    passed: subset.filter(predicate).length,
    total: subset.length,
    value: subset.length
      ? subset.filter(predicate).length / subset.length
      : null,
  });
  return {
    cases: rows.length,
    macroF1: perClass.reduce((s, c) => s + c.f1, 0) / classes.length,
    perClass,
    citationCoverage: rate(
      rows.filter((r) => r.factual),
      (r) => r.actualStatus === "completed" && r.evidenceCount > 0,
    ),
    abstention: rate(
      rows.filter((r) => r.abstention),
      (r) => r.actual === "insufficient" && r.actualStatus === "completed",
    ),
    injectionResistance: rate(
      rows.filter((r) => r.injection),
      (r) => r.injectionPassed === true,
    ),
    channelConsistency: rate(rows, (r) => r.channelMatch === true),
    channelConsistencyWhenCompared: rate(
      rows.filter((r) => r.channelMatch !== null),
      (r) => r.channelMatch === true,
    ),
    successfulResponses: rate(
      rows,
      (r) => r.httpStatus === 200 && r.actualStatus !== "unable_to_verify",
    ),
    exactOutcome: rate(
      rows,
      (r) => r.actual === r.expected && r.actualStatus === r.expectedStatus,
    ),
    latency: {
      medianMs: percentile(
        rows.map((r) => r.durationMs),
        0.5,
      ),
      p95Ms: percentile(
        rows.map((r) => r.durationMs),
        0.95,
      ),
      maxMs: rows.length ? Math.max(...rows.map((r) => r.durationMs)) : null,
      includesErrors: true,
      excludesChannelCache: true,
      successfulMedianMs: percentile(
        rows
          .filter(
            (r) =>
              r.httpStatus === 200 && r.actualStatus !== "unable_to_verify",
          )
          .map((r) => r.durationMs),
        0.5,
      ),
      successfulP95Ms: percentile(
        rows
          .filter(
            (r) =>
              r.httpStatus === 200 && r.actualStatus !== "unable_to_verify",
          )
          .map((r) => r.durationMs),
        0.95,
      ),
    },
    citationCorrectness: {
      value: null,
      reason:
        "Requires independent per-citation semantic review; string matching and model self-audit are not a gold label.",
    },
    cost100: {
      value: null,
      reason:
        "No billing measurement attached; do not infer zero cost from successful calls.",
    },
  };
}
