import { expect, it } from "vitest";
import { verdictSchema } from "@/core/contracts";
import { validateAssessment } from "@/core/evidence";
import { channelReply } from "@/core/channel";
import { demoResult } from "@/core/demo";

it("exposes exactly the five categories required by the brief", () => {
  expect(verdictSchema.options).toEqual([
    "supported",
    "refuted",
    "misleading",
    "insufficient",
    "not_checkable",
  ]);
  expect(verdictSchema.safeParse("conflicting").success).toBe(false);
});
it("rejects misleading without contextual evidence even if the model gives support", () => {
  const demo = demoResult("nato")!;
  const documents = demo.sources.map((s) => ({
    ...s,
    chunks: demo.evidence
      .filter((e) => e.sourceId === s.id)
      .map((e) => ({ id: e.chunkId, text: e.quote })),
  }));
  expect(() =>
    validateAssessment({ ...demo, verdict: "misleading" }, documents),
  ).toThrow();
  expect(
    validateAssessment(
      {
        ...demo,
        verdict: "misleading",
        evidence: demo.evidence.map((e) => ({ ...e, relation: "context" })),
      },
      documents,
    ).verdict,
  ).toBe("misleading");
});
it("keeps long responses bounded without dropping quotations, limits or links", () => {
  const result = {
    ...demoResult("nato")!,
    explanation: "Bardzo długa informacja. ".repeat(150),
  };
  const channel = channelReply(result);
  expect(channel.messages.length).toBeGreaterThan(2);
  expect(channel.messages.every((m) => m.length <= 1800)).toBe(true);
  const text = channel.messages.join("");
  for (const e of result.evidence) expect(text).toContain(e.quote);
  for (const s of result.sources) expect(text).toContain(s.url);
  expect(text).toContain(result.limitations[0]);
});
it("never labels a clarification as a factual verdict in the adapter", () => {
  const reply = channelReply(demoResult("context")!);
  expect(reply.result.verdict).toBeNull();
  expect(reply.messages.join("\n")).toContain(
    "Status obsługi: Potrzebne doprecyzowanie",
  );
  expect(reply.messages.join("\n")).not.toContain("Ocena:");
});
