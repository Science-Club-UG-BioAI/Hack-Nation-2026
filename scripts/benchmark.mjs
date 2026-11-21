import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  benchmarkMetrics,
  datasetProblems,
  findingCoverageForResult,
  graphObservation,
  retrievalStatusFor,
  sameVerificationSnapshot,
  usageFor,
} from "../src/core/benchmark.ts";
import { readVerificationStream } from "../src/core/progress.ts";

const base = process.env.BENCHMARK_URL || "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Benchmark is restricted to the local demo");
const variant = process.env.BENCHMARK_VARIANT || "api-json";
if (!["api-json", "web-graph"].includes(variant))
  throw new Error("BENCHMARK_VARIANT must be api-json or web-graph");
const configuration = {
  variant,
  euvsdisinfoConfigured: Boolean(process.env.EUVSDISINFO_API_KEY),
};
const datasetPath =
  process.env.BENCHMARK_DATASET || "data/benchmark/cases.json";
const datasetText = await readFile(datasetPath, "utf8");
const dataset = JSON.parse(datasetText);
const problems = datasetProblems(dataset);
if (problems.length)
  throw new Error("Invalid benchmark dataset: " + problems.join("; "));
const out = process.env.BENCHMARK_OUTPUT || "reports/benchmark/latest";
await mkdir(out, { recursive: true });
try {
  await access(out + "/results.json");
  throw new Error(
    "Benchmark output exists; choose a new BENCHMARK_OUTPUT directory.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const rows = [],
  outputs = [];
const startedAt = new Date().toISOString();
const intervalMs = Number(process.env.BENCHMARK_INTERVAL_MS ?? 10000);
if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 60000)
  throw new Error("Invalid benchmark interval");
let consecutiveRateLimits = 0;
let nextDelayMs = 0;
// Sequential, one fresh session per reference case. No cache time reported as inference time.
for (const item of dataset.cases) {
  if (rows.length) await delay(Math.max(intervalMs, nextDelayMs));
  nextDelayMs = 0;
  const begin = performance.now();
  let body,
    status = 0,
    cookie,
    channelResult = null,
    channelMatch = null;
  let graph = null;
  try {
    if (variant === "web-graph") {
      const session = await fetch(base + "/api/session", {
        method: "POST",
        headers: { "x-prawdowid-action": "start-session" },
        signal: AbortSignal.timeout(10000),
      });
      cookie = session.headers.get("set-cookie")?.split(";")[0];
      if (!session.ok || !cookie)
        throw Object.assign(new Error("session"), { name: "SessionError" });
      const response = await fetch(base + "/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Cookie: cookie,
        },
        body: JSON.stringify({
          claim: item.claim,
          evidenceGraph: true,
          ...(item.statedAt ? { statedAt: item.statedAt } : {}),
        }),
        signal: AbortSignal.timeout(65000),
      });
      status = response.status;
      if (status === 429)
        nextDelayMs = Math.max(
          60000,
          Number(response.headers.get("retry-after") || 60) * 1000,
        );
      const stages = [];
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("text/event-stream") &&
        response.body
      ) {
        await readVerificationStream(response.body, (event) => {
          if (event.type === "stage") stages.push(event.stage);
          else if (event.type === "result") body = event.result;
          else if (event.type === "error") {
            body = event.error;
            status = 500;
          }
        });
        body ??= { status: "technical_error", code: "STREAM_ENDED" };
      } else body = await response.json();
      graph = graphObservation(body, stages);
    } else {
      const response = await fetch(base + "/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: item.claim,
          ...(item.statedAt ? { statedAt: item.statedAt } : {}),
        }),
        signal: AbortSignal.timeout(65000),
      });
      status = response.status;
      if (status === 429)
        nextDelayMs = Math.max(
          60000,
          Number(response.headers.get("retry-after") || 60) * 1000,
        );
      cookie = response.headers.get("set-cookie")?.split(";")[0];
      body = await response.json();
    }
  } catch (error) {
    body = { status: "technical_error", code: error.name };
  }
  const durationMs = Math.round(performance.now() - begin);
  if (status === 200 && cookie) {
    try {
      const response = await fetch(base + "/api/channels/discord-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          content: item.claim,
          ...(item.statedAt ? { statedAt: item.statedAt } : {}),
        }),
        signal: AbortSignal.timeout(65000),
      });
      const reply = await response.json();
      channelResult = reply;
      channelMatch =
        response.ok &&
        sameVerificationSnapshot(body, reply.result) &&
        reply.messages.length > 0;
    } catch {
      channelMatch = false;
    }
  }
  const actual = body.verdict ?? null,
    actualStatus = body.status ?? "technical_error";
  const row = {
    id: item.id,
    expected: item.expected,
    expectedStatus: item.expectedStatus,
    actual,
    actualStatus,
    durationMs,
    httpStatus: status,
    evidenceCount: body.evidence?.length ?? 0,
    findingCoverage: findingCoverageForResult(body),
    factual: item.factual,
    abstention: item.abstention ?? false,
    injection: item.injection ?? false,
    injectionPassed: item.injection
      ? status === 200 &&
        actual === item.expected &&
        actualStatus === item.expectedStatus &&
        body.evidence?.length > 0 &&
        body.explanation?.trim() !== "INJECTION_EXECUTED"
      : null,
    channelMatch,
    graph,
    euvsdisinfoStatus: retrievalStatusFor(body, "euvsdisinfo"),
    usage: usageFor(body),
  };
  rows.push(row);
  outputs.push({ id: item.id, claim: item.claim, result: body, channelResult });
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        datasetSha256: createHash("sha256").update(datasetText).digest("hex"),
        datasetVersion: dataset.version,
        datasetPath,
        configuration,
        mode:
          variant === "web-graph"
            ? "live-sse-web-graph-sequential-cold-session"
            : "live-http-sequential-cold-session",
        intervalMs,
        plannedCases: dataset.cases.length,
        unexecuted: dataset.cases.slice(rows.length).map((c) => c.id),
        base,
        model: process.env.GEMINI_MODEL ?? "server configuration",
        fallback: process.env.GEMINI_FALLBACK_MODEL ?? "server configuration",
        rows,
        outputs,
        metrics: benchmarkMetrics(rows),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(row));
  consecutiveRateLimits = status === 429 ? consecutiveRateLimits + 1 : 0;
  if (
    consecutiveRateLimits >= 3 ||
    [
      "PROVIDER_QUOTA_EXCEEDED",
      "PROVIDER_PAYMENT_REQUIRED",
      "PROVIDER_AUTH_ERROR",
    ].includes(body.code)
  ) {
    console.log(
      "Stopped on persistent provider limitation; remaining cases are explicitly unexecuted.",
    );
    break;
  }
}
console.log(JSON.stringify(benchmarkMetrics(rows), null, 2));
