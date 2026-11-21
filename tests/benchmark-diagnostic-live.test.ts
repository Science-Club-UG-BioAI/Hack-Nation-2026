import { it, vi, expect } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { verify } from "@/server/verify";
import { AppError, InvalidModelOutput } from "@/core/errors";
import dataset from "../data/benchmark/cases.json";
const diagnostics = vi.hoisted(
  () =>
    [] as {
      basis: unknown;
      findings: unknown;
      availableIds: string[];
      selectedIds: string[];
      issues: string[];
    }[],
);
const stages = vi.hoisted(() => [] as unknown[]);
const transport = vi.hoisted(() => [] as unknown[]);
vi.mock("@/server/gemini-transport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/gemini-transport")>();
  return {
    ...actual,
    geminiResponse: async (
      ...args: Parameters<typeof actual.geminiResponse>
    ) => {
      const response = await actual.geminiResponse(...args);
      const body = response as Record<string, unknown>;
      transport.push({
        keys: Object.keys(body),
        status: body.status,
        usage: body.usage,
        error: body.error,
      });
      return response;
    },
  };
});
vi.mock("@/server/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/providers")>();
  return {
    ...actual,
    generate: async (...args: Parameters<typeof actual.generate>) => {
      const response = await actual.generate(...args);
      // Public benchmark inputs only; never capture provider credentials or headers.
      stages.push({ input: args[2], response });
      return response;
    },
  };
});
vi.mock("@/core/quotations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/quotations")>();
  return {
    ...actual,
    resolveSelection: (...args: Parameters<typeof actual.resolveSelection>) => {
      const draft = args[0] as {
        basis?: unknown;
        findings?: unknown;
        evidence?: { quoteId: string }[];
      };
      const record = {
        basis: draft.basis,
        findings: draft.findings,
        availableIds: [...args[1].quotes.keys()],
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
    const directory =
      process.env.BENCHMARK_DIAGNOSTIC_OUTPUT ||
      "reports/benchmark/diagnostics";
    const path = `${directory}/${item.id}.json`;
    if (existsSync(path))
      throw new Error("Diagnostic output exists; select a new directory.");
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
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          caseId: item.id,
          scope:
            "Separate diagnostic repeat, excluded from headline comparison",
          checkedAt: new Date().toISOString(),
          diagnostics,
          stages,
          transport,
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
