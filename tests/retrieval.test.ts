vi.mock("@/server/corpus", () => ({
  corpus: async () => ({ hits: [], partial: false }),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retrieve } from "@/server/retrieval";
import { search } from "@/server/providers";
import { wikipedia, sejm, arxiv } from "@/server/source-adapters";
import { planSchema } from "@/core/contracts";

vi.mock("@/server/providers", () => ({ search: vi.fn() }));
vi.mock("@/server/source-adapters", () => ({
  wikipedia: vi.fn(),
  sejm: vi.fn(),
  arxiv: vi.fn(),
}));
const plan = planSchema.parse({
  checkable: true,
  needsClarification: false,
  explanation: "Test",
  queries: ["neutral query", "counter evidence"],
  wikipediaQuery: "Polska",
});
const hit = {
  title: "Polska",
  url: "https://pl.wikipedia.org/wiki/Polska",
  raw_content: "Materiał encyklopedyczny dotyczący Polski.",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(search).mockResolvedValue([]);
  vi.mocked(wikipedia).mockResolvedValue({ hits: [hit], partial: false });
});
describe("multi-source retrieval", () => {
  it("calls only relevant direct APIs", async () => {
    const result = await retrieve(plan, new AbortController().signal);
    expect(result.hits).toEqual([hit]);
    expect(wikipedia).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(2);
    expect(sejm).not.toHaveBeenCalled();
    expect(arxiv).not.toHaveBeenCalled();
    expect(result.statuses).toContainEqual({
      provider: "arxiv",
      status: "not_applicable",
      documents: 0,
    });
  });
  it("keeps available direct evidence when web search fails, with visible status", async () => {
    vi.mocked(search).mockRejectedValue(new Error("down"));
    const result = await retrieve(plan, new AbortController().signal);
    expect(result.hits).toHaveLength(1);
    expect(result.statuses).toContainEqual({
      provider: "web",
      status: "error",
      documents: 0,
    });
  });
  it("distinguishes partial web search from complete retrieval", async () => {
    vi.mocked(search)
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce([hit]);
    const progress = vi.fn();
    const result = await retrieve(plan, new AbortController().signal, progress);
    const web = { provider: "web", status: "partial", documents: 1 };
    expect(result.statuses).toContainEqual(web);
    expect(
      progress.mock.calls
        .map(([event]) => event.source)
        .filter((source) => source.provider === "web")
        .at(-1),
    ).toEqual(web);
  });
  it("never turns a total outage into a factual verdict", async () => {
    vi.mocked(search).mockRejectedValue(new Error("down"));
    vi.mocked(wikipedia).mockRejectedValue(new Error("down"));
    await expect(
      retrieve(plan, new AbortController().signal),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
