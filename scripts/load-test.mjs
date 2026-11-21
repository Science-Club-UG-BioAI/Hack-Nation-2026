// Run from the repo root. --benchmark also drives the unchanged benchmark runner.
import { createServer as httpServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { NextRequest } from "next/server.js";
import { createServer } from "vite";

const benchmark = process.argv.includes("--benchmark");
const folder = resolve(benchmark ? "reports/cost" : "reports/load");
await mkdir(folder, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), "kitcheck-measure-"));
Object.assign(process.env, {
  GEMINI_API_KEY: "offline-fixture",
  GOOGLE_FACTCHECK_API_KEY: "offline-fixture",
  GEMINI_MODEL: "gemini-3.1-flash-lite",
  GEMINI_FALLBACK_MODEL: "",
  EUVSDISINFO_API_KEY: "",
  BENCHMARK_VARIANT: "api-json",
  BENCHMARK_DATASET: "data/benchmark/cases.json",
  ALERT_WEBHOOK_URL: "",
  AUDIT_DB_PATH: join(scratch, "checks.sqlite"),
  MAX_CONCURRENT_VERIFICATIONS: "3",
  MAX_LIVE_VERIFICATIONS: "150",
});
const vite = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  resolve: { alias: { "@": resolve("src") } },
  server: { middlewareMode: true, hmr: false, watch: null, ws: false },
});
const localFetch = globalThis.fetch;
const calls = { gemini: 0, factCheck: 0 };
const quote = "Kontrolowany pomiar wykazał masę próbki równą pięć gramów.";
const plan = {
  checkable: true,
  needsClarification: false,
  explanation: "Pomiar kontrolny.",
  factCheckQueries: ["xx-fixture-qone", "xx-fixture-qtwo"],
  queries: ["xx-fixture-qone", "xx-fixture-qtwo"],
};
const assessment = {
  verdict: "supported",
  proofGaps: [],
  findings: [{ id: "f1", text: quote, quoteIds: ["q1", "q2"] }],
  basis: {
    kind: "confirmed",
    establishedPremise: "",
    inferenceOrCorrection: "Wynik pomiaru.",
    premiseQuoteIds: [],
    decisiveQuoteIds: ["q1", "q2"],
  },
  explanation: quote,
  limitations: [],
  evidence: ["q1", "q2"].map((quoteId) => ({
    quoteId,
    relation: "supports",
    scope: "direct",
    relevance: "Wynik pomiaru.",
  })),
};
const audit = {
  approved: true,
  reason: "Spójne cytaty.",
  findingChecks: [{ findingId: "f1", supported: true, atomic: true }],
};
globalThis.fetch = async (url, init) => {
  const address = String(url);
  await delay(benchmark ? 0 : 20, undefined, { signal: init?.signal });
  const endpoint = new URL(address);
  if (
    endpoint.origin === "https://factchecktools.googleapis.com" &&
    endpoint.pathname === "/v1alpha1/claims:search"
  ) {
    calls.factCheck++;
    return Response.json({
      claims: [
        {
          text: quote,
          claimReview: [
            {
              url: "https://demagog.org.pl/fixture",
              textualRating: "Prawda",
              title: "Ocena Alfa",
            },
            {
              url: "https://beta.example/raport",
              textualRating: "Potwierdzone",
              title: "Ocena Beta",
            },
          ],
        },
      ],
    });
  }
  if (
    address !== "https://generativelanguage.googleapis.com/v1beta/interactions"
  )
    throw Error("Unexpected destination in offline test");
  calls.gemini++;
  const fields = JSON.parse(init.body).response_format.schema.properties;
  const [reply, input, output] = fields.checkable
    ? [plan, 1200, 100]
    : fields.approved
      ? [audit, 2400, 200]
      : [assessment, 3500, 450];
  return Response.json({
    status: "completed",
    usage: {
      total_input_tokens: input,
      total_output_tokens: output,
      total_thought_tokens: 0,
    },
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(reply) }],
      },
    ],
  });
};
let server;
try {
  const { POST: web } = await vite.ssrLoadModule(
    "/src/app/api/verify/route.ts",
  );
  const { POST: discord } = await vite.ssrLoadModule(
    "/src/app/api/channels/discord-demo/route.ts",
  );
  server = httpServer(async (req, res) => {
    try {
      const handler =
        req.url === "/api/verify"
          ? web
          : req.url === "/api/channels/discord-demo"
            ? discord
            : null;
      if (!handler || req.method !== "POST") {
        res.writeHead(404).end();
        return;
      }
      const parts = [];
      for await (const part of req) parts.push(part);
      const response = await handler(
        new NextRequest("http://127.0.0.1" + req.url, {
          method: "POST",
          headers: req.headers,
          body: Buffer.concat(parts),
        }),
      );
      res
        .writeHead(response.status, Object.fromEntries(response.headers))
        .end(await response.text());
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  if (benchmark) {
    const dataset = JSON.parse(
      await readFile("data/benchmark/cases.json", "utf8"),
    );
    const cases = Array.from({ length: 100 }, (_, i) => ({
      ...dataset.cases[i % dataset.cases.length],
      id: dataset.cases[i % dataset.cases.length].id + "-" + (i + 1),
    }));
    await mkdir(join(scratch, "data/benchmark"), { recursive: true });
    await writeFile(
      join(scratch, "data/benchmark/cases.json"),
      JSON.stringify({ ...dataset, cases }),
    );
    const raw = join(scratch, "raw");
    const runner = spawn(
      process.execPath,
      ["--experimental-strip-types", resolve("scripts/benchmark.mjs")],
      {
        cwd: scratch,
        env: {
          ...process.env,
          BENCHMARK_URL: base,
          BENCHMARK_INTERVAL_MS: "0",
          BENCHMARK_OUTPUT: raw,
        },
        windowsHide: true,
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
    const [code] = await once(runner, "exit");
    if (code !== 0) throw Error("Benchmark runner failed");
    const run = JSON.parse(await readFile(join(raw, "results.json"), "utf8"));
    const rows = run.outputs.map((o) => ({
      id: o.id,
      request: o.result.usage,
      replay: o.channelResult?.result?.usage,
    }));
    if (
      rows.length !== 100 ||
      rows.some(
        (r) =>
          r.request?.cached !== false ||
          r.replay?.cached !== true ||
          r.request.costUsd !== null ||
          r.replay.costUsd !== 0,
      )
    )
      throw Error("Missing measured usage or cache replay");
    await writeFile(
      join(folder, "offline.json"),
      JSON.stringify(
        {
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          datasetSha256: run.datasetSha256,
          mode: "controlled-http-synthetic-usage",
          originalCases: dataset.cases.length,
          calls,
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const measurements = [];
    for (const concurrent of [1, 3, 12]) {
      const before = { ...calls },
        rows = [];
      for (let wave = 0; wave < 5; wave++) {
        rows.push(
          ...(await Promise.all(
            Array.from({ length: concurrent }, async (_, i) => {
              const start = performance.now();
              const res = await localFetch(base + "/api/verify", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  claim: quote + " Próba " + wave + "-" + i,
                }),
              });
              const body = await res.json();
              if (res.ok && body.verdict !== "supported")
                throw Error("Fixture verification failed");
              return { status: res.status, ms: performance.now() - start };
            }),
          )),
        );
      }
      const times = (sample) => {
        const sorted = sample.map((r) => r.ms).sort((a, b) => a - b);
        const pct = (q) =>
          sorted.length
            ? +sorted[Math.ceil(sorted.length * q) - 1].toFixed(1)
            : null;
        return { medianMs: pct(0.5), p95Ms: pct(0.95) };
      };
      const ok = rows.filter((r) => r.status === 200),
        limited = rows.filter((r) => r.status === 429);
      const errors = rows.length - ok.length;
      measurements.push({
        concurrent,
        requests: rows.length,
        ok: ok.length,
        http429: limited.length,
        otherErrors: errors - limited.length,
        errorPercent: (100 * errors) / rows.length,
        all: times(rows),
        successful: times(ok),
        rejected429: times(limited),
        geminiCalls: calls.gemini - before.gemini,
        factCheckCalls: calls.factCheck - before.factCheck,
      });
    }
    if (
      measurements.some((r) => r.otherErrors || !r.ok) ||
      !measurements.at(-1).http429
    )
      throw Error("Unexpected load-test outcomes");
    await writeFile(
      join(folder, "local.json"),
      JSON.stringify(
        {
          runAt: new Date().toISOString(),
          node: process.version,
          providerDelayMs: 20,
          measurements,
        },
        null,
        2,
      ) + "\n",
    );
  }
} finally {
  globalThis.fetch = localFetch;
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  const { closeAuditStore } = await vite.ssrLoadModule(
    "/src/server/audit-store.ts",
  );
  closeAuditStore();
  await vite.close();
  await rm(scratch, { recursive: true, force: true });
}
