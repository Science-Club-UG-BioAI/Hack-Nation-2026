import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { citationReviewMetrics } from "../src/core/benchmark.ts";

export async function reviewRunCitations(directory, run, resultSha256) {
  const items = run.outputs.flatMap((output) =>
    (output.result.evidence ?? []).map((e, index) => ({
      id: `${output.id}:${index}`,
      claim: output.claim,
      quote: e.quote,
      relation: e.relation,
      relevance: e.relevance,
      findings:
        output.result.findings?.filter((f) => f.evidenceIds.includes(e.id)) ??
        null,
      verdict: output.result.verdict ?? null,
      url: output.result.sources?.find((s) => s.id === e.sourceId)?.url,
      entails: null,
      relationCorrect: null,
      atomic: null,
      factual: null,
      valid: null,
      reason: "",
    })),
  );
  const template = {
    resultSha256,
    reviewer: null,
    method: { kind: null, model: null, notes: "" },
    auditedModels: [run.model, run.fallback].filter(Boolean),
    policy:
      "Follow docs/citation-review.md. Judge every item on entails, relationCorrect, atomic and factual; valid=true only if all applicable dimensions hold. A model reviewer must differ from auditedModels. Structural references and the model's own audit are not gold labels.",
    items,
  };
  await writeFile(
    resolve(directory, "citation-review.template.json"),
    JSON.stringify(template, null, 2) + "\n",
  );
  let review = null;
  try {
    review = JSON.parse(
      await readFile(resolve(directory, "citation-review.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return citationReviewMetrics(
    resultSha256,
    items.map((i) => i.id),
    review,
    template.auditedModels,
  );
}
