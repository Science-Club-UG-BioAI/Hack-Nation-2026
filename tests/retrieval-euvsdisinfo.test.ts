vi.mock("@/server/corpus", () => ({
  corpus: async () => ({ hits: [], partial: false }),
}));
vi.mock("@/server/fact-check", () => ({ factCheck: vi.fn() }));
vi.mock("@/server/euvsdisinfo", () => ({
  euvsdisinfo: vi.fn(),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retrieve } from "@/server/retrieval";
import { factCheck } from "@/server/fact-check";
import { euvsdisinfo } from "@/server/euvsdisinfo";
import { planSchema, providerLabels } from "@/core/contracts";

const base = {
  checkable: true,
  needsClarification: false,
  explanation: "Test",
  factCheckQueries: ["Ukraina", "laboratoria"],
  queries: ["neutral query", "counter evidence"],
};
const plan = planSchema.parse({ ...base, euvsdisinfoQuery: "Ukraine biolabs" });
const indexedReview = {
  title: "Ocena redakcji",
  url: "https://example.com/a",
  raw_content: "Metadane recenzji z indeksu Google Fact Check.",
};
const caseHit = {
  title: "Secret US biolabs in Ukraine",
  url: "https://euvsdisinfo.eu/report/secret-us-biolabs-in-ukraine",
  raw_content: "SUMMARY\n\nClaim.\n\nRESPONSE\n\nDebunk.",
  provider: "euvsdisinfo" as const,
};
const signal = () => new AbortController().signal;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_FACTCHECK_API_KEY", "fixture");
  vi.mocked(factCheck).mockResolvedValue([indexedReview]);
  vi.stubEnv("EUVSDISINFO_API_KEY", "fixture");
  vi.mocked(euvsdisinfo).mockResolvedValue({ hits: [caseHit], partial: false });
});

describe("EUvsDisinfo retrieval", () => {
  it("has a provider label for the UI", () => {
    expect(providerLabels.euvsdisinfo).toBe("EUvsDisinfo (EEAS)");
  });

  it("defaults the planner query to null", () => {
    expect(planSchema.parse(base).euvsdisinfoQuery).toBeNull();
  });

  it("queries EUvsDisinfo alongside indexed reviews", async () => {
    const result = await retrieve(plan, signal());
    expect(euvsdisinfo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(euvsdisinfo).mock.calls[0][0]).toBe("Ukraine biolabs");
    expect(result.hits).toEqual([indexedReview, indexedReview, caseHit]);
    expect(result.statuses).toContainEqual({
      provider: "euvsdisinfo",
      status: "ok",
      documents: 1,
    });
  });

  it("is not applicable without a planner query", async () => {
    const result = await retrieve(planSchema.parse(base), signal());
    expect(euvsdisinfo).not.toHaveBeenCalled();
    expect(result.statuses).toContainEqual({
      provider: "euvsdisinfo",
      status: "not_applicable",
      documents: 0,
    });
  });

  it("reports missing configuration without an API key", async () => {
    vi.stubEnv("EUVSDISINFO_API_KEY", "");
    const result = await retrieve(plan, signal());
    expect(euvsdisinfo).not.toHaveBeenCalled();
    expect(result.statuses).toContainEqual({
      provider: "euvsdisinfo",
      status: "not_configured",
      documents: 0,
    });
  });

  it("degrades an adapter failure to an error status", async () => {
    vi.mocked(euvsdisinfo).mockRejectedValue(new Error("down"));
    const result = await retrieve(plan, signal());
    expect(result.hits).toEqual([indexedReview, indexedReview]);
    expect(result.statuses).toContainEqual({
      provider: "euvsdisinfo",
      status: "error",
      documents: 0,
    });
  });

  it("reports an empty result", async () => {
    vi.mocked(euvsdisinfo).mockResolvedValue({ hits: [], partial: false });
    const result = await retrieve(plan, signal());
    expect(result.statuses).toContainEqual({
      provider: "euvsdisinfo",
      status: "empty",
      documents: 0,
    });
  });
});
