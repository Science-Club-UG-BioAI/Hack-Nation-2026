import { beforeEach, expect, it, vi } from "vitest";
import { verify } from "@/server/verify";
import { generate } from "@/server/providers";
import { retrieve } from "@/server/retrieval";
vi.mock("@/server/providers", () => ({ generate: vi.fn() }));
vi.mock("@/server/retrieval", () => ({ retrieve: vi.fn() }));
const input = {
  claim: "Raport projektu Koral z 2025 roku podaje masę próbki 6 gramów.",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(generate)
    .mockResolvedValueOnce({
      checkable: true,
      needsClarification: false,
      clarificationKind: "missing_evidence",
      queries: ["Koral pomiary", "Koral raport"],
      explanation: "Brak publicznego raportu.",
    })
    .mockResolvedValueOnce({
      verdict: "insufficient",
      findings: [],
      explanation: "UNVERIFIED MODEL TEXT",
      limitations: ["UNVERIFIED LIMITATION"],
      evidence: [],
      basis: {
        kind: "unresolved",
        establishedPremise: "",
        inferenceOrCorrection: "",
        premiseQuoteIds: [],
        decisiveQuoteIds: [],
      },
    });
  vi.mocked(retrieve).mockResolvedValue({
    hits: [
      {
        title: "Inny pomiar",
        url: "https://example.org/report",
        raw_content:
          "Dokument opisuje pomiary innego projektu i innej próbki. Nie dotyczy wskazanego raportu.",
      },
    ],
    statuses: [{ provider: "web", status: "ok", documents: 1 }],
  });
});
it("ends an evidence-free assessment without another model call or unaudited factual explanation", async () => {
  const result = await verify(input, "absent", new AbortController().signal);
  expect(result).toMatchObject({
    status: "completed",
    verdict: "insufficient",
    evidence: [],
  });
  expect(JSON.stringify(result)).not.toContain("UNVERIFIED");
  expect(result.sources).toHaveLength(1);
  expect(generate).toHaveBeenCalledTimes(2);
});
it("does not turn incomplete retrieval into successful abstention", async () => {
  const found = await vi.mocked(retrieve).getMockImplementation()!(
    {} as never,
    new AbortController().signal,
  );
  vi.mocked(retrieve).mockResolvedValue({
    ...found,
    statuses: [{ provider: "web", status: "partial", documents: 1 }],
  });
  expect(
    await verify(input, "partial", new AbortController().signal),
  ).toMatchObject({ status: "unable_to_verify", verdict: null });
});
it("discards incidental evidence when the model explicitly establishes no facts", async () => {
  vi.mocked(generate)
    .mockReset()
    .mockResolvedValueOnce({
      checkable: true,
      needsClarification: false,
      clarificationKind: "missing_evidence",
      queries: ["Projekt Koral pomiar", "Projekt Koral dokument"],
      explanation: "Szukaj dokumentu.",
    })
    .mockResolvedValueOnce({
      verdict: "insufficient",
      findings: [],
      explanation: "UNVERIFIED",
      limitations: [],
      evidence: [
        { quoteId: "q1", relation: "context", relevance: "Podobna nazwa." },
      ],
      basis: {
        kind: "unresolved",
        establishedPremise: "UNRELATED",
        inferenceOrCorrection: "UNVERIFIED",
        premiseQuoteIds: ["q1"],
        decisiveQuoteIds: [],
      },
    });
  const result = await verify(
    input,
    "incidental",
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    status: "completed",
    verdict: "insufficient",
    evidence: [],
    findings: [],
  });
  expect(JSON.stringify(result)).not.toMatch(/UNRELATED|UNVERIFIED/);
  expect(generate).toHaveBeenCalledTimes(2);
});
it("propagates model outages instead of using abstention as a fallback", async () => {
  vi.mocked(generate).mockReset().mockRejectedValue(new Error("outage"));
  await expect(
    verify(input, "outage", new AbortController().signal),
  ).rejects.toThrow("outage");
});
