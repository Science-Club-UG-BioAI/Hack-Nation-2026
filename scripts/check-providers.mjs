// Run with: node --env-file=.env.local scripts/check-providers.mjs
// Never prints keys, request headers or raw provider responses.
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log(JSON.stringify({ provider: "gemini", configured: false }));
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await response.json();
    const models = (data.models ?? [])
      .filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((model) => model.name.replace("models/", ""));
    console.log(
      JSON.stringify({
        provider: "gemini",
        status: response.status,
        configuredModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
        fallbackModel:
          process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
        availableTextModels: models
          .filter((name) => /flash|pro/.test(name))
          .slice(0, 35),
        errorStatus: data.error?.status,
      }),
    );
    if (!response.ok) process.exitCode = 1;
    if (response.ok && process.argv.includes("--generate")) {
      const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
      const generated = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
            "Api-Revision": "2026-05-20",
          },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            model,
            store: false,
            input: 'Reply with JSON: {"ok":true}',
            generation_config: {
              thinking_level: "low",
              max_output_tokens: 1000,
            },
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: {
                type: "object",
                properties: { ok: { type: "boolean" } },
                required: ["ok"],
              },
            },
          }),
        },
      );
      const generatedData = await generated.json();
      console.log(
        JSON.stringify({
          operation: "interactions",
          status: generated.status,
          errorStatus: generatedData.error?.status,
          errorCode: generatedData.error?.code,
          completionStatus: generatedData.status,
          stepTypes: generatedData.steps?.map((step) => step.type),
          outputTypes: generatedData.outputs?.map((output) => output.type),
        }),
      );
      if (!generated.ok || generatedData.status !== "completed")
        process.exitCode = 1;
    }
  } catch {
    console.log(
      JSON.stringify({
        provider: "gemini",
        error: "Connection failed or timed out",
      }),
    );
    process.exitCode = 1;
  }
}
for (const [provider, key] of [
  ["google_factcheck", "GOOGLE_FACTCHECK_API_KEY"],
  ["euvsdisinfo", "EUVSDISINFO_API_KEY"],
]) {
  console.log(
    JSON.stringify({ provider, configured: Boolean(process.env[key]?.trim()) }),
  );
}
