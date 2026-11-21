import { it, vi, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { verify } from "@/server/verify";
import { AppError, InvalidModelOutput } from "@/core/errors";
import dataset from "../data/benchmark/cases.json";
const diagnostics = vi.hoisted(
  () => [] as { basis: unknown; selectedIds: string[]; issues: string[] }[],
);
vi.mock("@/core/quotations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/quotations")>();
  return {
    ...actual,
    resolveSelection: (...args: Parameters<typeof actual.resolveSelection>) => {
      const draft = args[0] as {
        basis?: unknown;
        evidence?: { quoteId: string }[];
      };
      const record = {
        basis: draft.basis,
        selectedIds: draft.evidence?.map((e) => e.quoteId) ?? [],
        issues: [] as string[],
      };
      diagnostics.push(record);
      try {
        return actual.resolveSelection(...args);
      } catch (error) {
        record.issues =
          error instanceof InvalidModelOutput
            ? error.validationIssues
            : ["Unspecified validation failure"];
        throw error;
      }
    },
  };
});
it.skipIf(!process.env.BENCHMARK_DIAGNOSTIC_CASE)(
  "diagnoses a public reference case without changing the scored benchmark",
  async () => {
    const item = dataset.cases.find(
      (c) => c.id === process.env.BENCHMARK_DIAGNOSTIC_CASE,
    );
    if (!item) throw new Error("Unknown reference case");
    let result;
    try {
      result = await verify(
        { claim: item.claim },
        `diagnostic-${item.id}`,
        AbortSignal.timeout(60000),
      );
    } catch (error) {
      result = {
        status: "technical_error",
        code: error instanceof AppError ? error.code : "unknown",
        verdict: null,
      };
    }
    mkdirSync("reports/benchmark/diagnostics", { recursive: true });
    writeFileSync(
      `reports/benchmark/diagnostics/${item.id}.json`,
      JSON.stringify(
        {
          caseId: item.id,
          scope:
            "Separate diagnostic repeat, excluded from headline comparison",
          checkedAt: new Date().toISOString(),
          diagnostics,
          result,
        },
        null,
        2,
      ) + "\n",
    );
    expect(result.verdict).toBe(item.expected);
  },
  75000,
);
