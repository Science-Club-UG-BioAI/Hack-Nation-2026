import { AppError } from "@/core/errors";
import { AsyncLocalStorage } from "node:async_hooks";
import type { VerificationResult } from "@/core/contracts";

// Standard text prices per million tokens and Tavily PAYGO per credit.
// Sources and assumptions are recorded in reports/cost/README.md.
const modelRates: Record<
  string,
  { input: number; cached: number; output: number }
> = {
  "gemini-3.1-flash-lite": { input: 0.25, cached: 0.025, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, cached: 0.03, output: 2.5 },
};
export const TAVILY_CREDIT_USD = 0.008;
export type UsageCall = {
  provider:
    | "gemini"
    | "tavily"
    | "wikipedia"
    | "arxiv"
    | "sejm"
    | "euvsdisinfo"
    | "google_factcheck"
    | "demagog";
  model?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens?: number | null;
  credits?: number | null;
  costUsd: number | null;
};
export const usageContext = new AsyncLocalStorage<UsageCall[]>();

export function startCall(
  provider: UsageCall["provider"],
  model?: string,
): UsageCall {
  const call = {
    provider,
    model,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
  };
  usageContext.getStore()?.push(call);
  return call;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function recordModelUsage(call: UsageCall, body: unknown) {
  if (
    !body ||
    typeof body !== "object" ||
    !("usage" in body) ||
    !body.usage ||
    typeof body.usage !== "object"
  )
    return;
  const usage = body.usage as Record<string, unknown>;
  const input = count(usage.total_input_tokens);
  const output = count(usage.total_output_tokens);
  // Optional breakdowns are omitted when the provider reports no such tokens.
  const thoughts = count(
    usage.total_thought_tokens === undefined ? 0 : usage.total_thought_tokens,
  );
  const cached = count(
    usage.total_cached_tokens === undefined ? 0 : usage.total_cached_tokens,
  );
  call.inputTokens = input;
  call.outputTokens =
    output !== null && thoughts !== null ? output + thoughts : null;
  call.cachedTokens = cached;
  const model = call.model ?? "";
  const rates = Object.hasOwn(modelRates, model)
    ? modelRates[model]
    : undefined;
  if (
    rates &&
    input !== null &&
    call.outputTokens !== null &&
    cached !== null &&
    cached <= input
  )
    call.costUsd =
      ((input - cached) * rates.input +
        cached * rates.cached +
        call.outputTokens * rates.output) /
      1_000_000;
}

export function summarizeUsage(
  calls: UsageCall[],
  cached: boolean,
): NonNullable<VerificationResult["usage"]> {
  const models = calls.filter((c) => c.provider === "gemini");
  const sum = (
    items: UsageCall[],
    key: "inputTokens" | "outputTokens" | "costUsd",
  ) => {
    let total = 0;
    for (const item of items) {
      const value = item[key];
      if (value === null) return null;
      total += value;
    }
    return total;
  };
  return {
    inputTokens: sum(models, "inputTokens"),
    outputTokens: sum(models, "outputTokens"),
    searchCalls: calls.length - models.length,
    costUsd: sum(calls, "costUsd"),
    cached,
  };
}

export function numberSetting(name: string, fallback: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}
export function configuration() {
  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const tavily = Boolean(process.env.TAVILY_API_KEY?.trim());
  return { ready: gemini && tavily, gemini, tavily };
}
export function requireConfiguration() {
  if (!configuration().ready)
    throw new AppError(
      "NOT_CONFIGURED",
      "Tryb online wymaga kluczy GEMINI_API_KEY i TAVILY_API_KEY w pliku .env.local. Możesz obejrzeć oznaczone przykłady demonstracyjne.",
      503,
    );
}
