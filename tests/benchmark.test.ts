import { describe, it, expect } from "vitest";
import {
  benchmarkMetrics,
  findingCoverageForResult,
  sameVerificationSnapshot,
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
  findingCoverage: { version: "findings-v1", total: 2, covered: 2 },
  factual: true,
  abstention: false,
  injection: false,
  injectionPassed: null,
  channelMatch: true,
  ...overrides,
});
describe("benchmark scoring", () => {
  it("requires the entire factual response to agree between channels, not just the verdict", () => {
    const original = {
      requestId: "snapshot",
      verdict: "supported",
      status: "completed",
      findings: [{ id: "f1", text: "A fact", evidenceIds: ["q1"] }],
      explanation: "A fact [1]",
      limitations: [],
      evidence: [],
      sources: [],
    };
    expect(
      sameVerificationSnapshot(original, {
        ...original,
        delivery: { channel: "discord_demo" },
      }),
    ).toBe(true);
    for (const key of [
      "findings",
      "explanation",
      "limitations",
      "requestId",
      "status",
      "evidence",
      "sources",
    ])
      expect(
        sameVerificationSnapshot(original, { ...original, [key]: "changed" }),
      ).toBe(false);
    expect(sameVerificationSnapshot({}, {})).toBe(false);
    expect(sameVerificationSnapshot(original, null)).toBe(false);
  });
  it("weights individual findings, including additional facts in non-factual test cases", () => {
    const score = benchmarkMetrics([
      row("a", {
        evidenceCount: 1,
        findingCoverage: { version: "findings-v1", total: 5, covered: 1 },
      }),
      row("b", {
        factual: false,
        findingCoverage: { version: "findings-v1", total: 1, covered: 1 },
      }),
    ]).citationCoverage;
    expect(score).toMatchObject({
      passed: 2,
      total: 6,
      value: 2 / 6,
      complete: true,
    });
  });
  it("does not invent coverage for old reports, mixed versions, or empty abstentions", () => {
    expect(
      benchmarkMetrics([row("old", { findingCoverage: undefined })])
        .citationCoverage,
    ).toMatchObject({ value: null, unknownResponses: 1, complete: false });
    expect(
      benchmarkMetrics([row("new"), row("old", { findingCoverage: undefined })])
        .citationCoverage.value,
    ).toBeNull();
    expect(
      benchmarkMetrics([
        row("empty", {
          findingCoverage: { version: "findings-v1", total: 0, covered: 0 },
        }),
      ]).citationCoverage.value,
    ).toBeNull();
    expect(
      benchmarkMetrics([
        row("bad", {
          findingCoverage: { version: "findings-v1", total: 1, covered: 2 },
        }),
      ]).citationCoverage.value,
    ).toBeNull();
  });
  it("counts only references to published evidence with an existing source", () => {
    const result = {
      citationContract: "findings-v1",
      status: "completed",
      verdict: "supported",
      sources: [{ id: "s1" }],
      evidence: [
        { id: "q1", sourceId: "s1", chunkId: "p1", quote: "A real quotation." },
      ],
      findings: [
        { id: "f1", text: "First fact.", evidenceIds: ["q1"] },
        { id: "f2", text: "Second fact.", evidenceIds: [] },
        { id: "f3", text: "Third fact.", evidenceIds: ["missing"] },
      ],
    };
    expect(findingCoverageForResult(result)).toEqual({
      version: "findings-v1",
      total: 3,
      covered: 1,
    });
    expect(findingCoverageForResult({ ...result, sources: [] })?.covered).toBe(
      0,
    );
    expect(findingCoverageForResult({ ...result, sources: [null] })).toBeNull();
    expect(
      findingCoverageForResult({ ...result, evidence: [null] }),
    ).toBeNull();
    expect(findingCoverageForResult({ ...result, findings: [] })).toBeNull();
    expect(
      findingCoverageForResult({
        ...result,
        findings: [result.findings[0], result.findings[0]],
      }),
    ).toBeNull();
    expect(
      findingCoverageForResult({ ...result, citationContract: undefined }),
    ).toBeNull();
    expect(findingCoverageForResult({ status: "technical_error" })).toEqual({
      version: "findings-v1",
      total: 0,
      covered: 0,
    });
  });
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
        findingCoverage: { version: "findings-v1", total: 0, covered: 0 },
      }),
    ]);
    expect(metrics.perClass[0]).toMatchObject({
      tp: 1,
      fn: 1,
      fp: 0,
      f1: 2 / 3,
    });
    expect(metrics.citationCoverage).toMatchObject({ value: 1, total: 2 });
    expect(metrics.successfulResponses.value).toBe(0.5);
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
