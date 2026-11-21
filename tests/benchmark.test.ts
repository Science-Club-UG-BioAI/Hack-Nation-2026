import { describe, it, expect } from "vitest";
import {
  benchmarkMetrics,
  citationReviewMetrics,
  percentile,
  type Observation,
} from "@/core/benchmark";
import cases from "../data/benchmark/cases.json";
import { verifyInputSchema } from "@/core/contracts";
const row = (
  id: string,
  overrides: Partial<Observation> = {},
): Observation => ({
  id,
  expected: "supported",
  expectedStatus: "completed",
  actual: "supported",
  actualStatus: "completed",
  httpStatus: 200,
  durationMs: 1000,
  evidenceCount: 2,
  factual: true,
  abstention: false,
  injection: false,
  injectionPassed: null,
  channelMatch: true,
  ...overrides,
});
describe("benchmark scoring", () => {
  it("rejects stale and duplicate semantic reviews and does not call a sample complete", () => {
    const review = {
      resultSha256: "abc",
      reviewer: "Independent reviewer",
      items: [{ id: "T01:0", valid: true, reason: "Entails exact date" }],
    };
    expect(
      citationReviewMetrics("different", ["T01:0"], review).value,
    ).toBeNull();
    expect(
      citationReviewMetrics("abc", ["T01:0", "T02:0"], review),
    ).toMatchObject({ value: 1, reviewed: 1, total: 2, complete: false });
    expect(
      citationReviewMetrics("abc", ["T01:0"], {
        ...review,
        items: [...review.items, ...review.items],
      }).value,
    ).toBeNull();
    expect(citationReviewMetrics("abc", ["T01:0"], review)).toMatchObject({
      value: 1,
      complete: true,
    });
  });
  it("counts service errors and abstentions as false negatives, not excluded rows", () => {
    const metrics = benchmarkMetrics([
      row("a"),
      row("b", {
        actual: null,
        actualStatus: "technical_error",
        httpStatus: 504,
        durationMs: 60000,
        evidenceCount: 0,
      }),
    ]);
    expect(metrics.perClass[0]).toMatchObject({
      tp: 1,
      fn: 1,
      fp: 0,
      f1: 2 / 3,
    });
    expect(metrics.citationCoverage.value).toBe(0.5);
    expect(metrics.latency.medianMs).toBe(30500);
  });
  it("does not reward technical failures as correct abstentions", () => {
    expect(
      benchmarkMetrics([
        row("a", {
          expected: "insufficient",
          actual: null,
          actualStatus: "unable_to_verify",
          abstention: true,
        }),
      ]).abstention.value,
    ).toBe(0);
  });
  it("computes interpolated percentiles and leaves unavailable measures unknown", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([], 0.95)).toBeNull();
    expect(benchmarkMetrics([]).citationCorrectness.value).toBeNull();
    expect(benchmarkMetrics([]).injectionResistance.value).toBeNull();
  });
  it("has at least 30 unique admissible inputs covering all categories and attacks", () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.cases.map((c) => c.id)).size).toBe(cases.cases.length);
    for (const c of cases.cases)
      expect(verifyInputSchema.safeParse({ claim: c.claim }).success).toBe(
        true,
      );
    expect(new Set(cases.cases.map((c) => c.expected)).size).toBe(6);
    expect(
      cases.cases.filter((c) => c.injection).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
