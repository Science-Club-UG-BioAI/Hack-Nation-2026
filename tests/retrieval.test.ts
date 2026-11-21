vi.mock("@/server/corpus", () => ({
  corpus: vi.fn(),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retrieve } from "@/server/retrieval";
import { search } from "@/server/providers";
import { corpus } from "@/server/corpus";
import { wikipedia, sejm, arxiv } from "@/server/source-adapters";
import { planSchema } from "@/core/contracts";
import { prepareDocuments } from "@/core/evidence";

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
  sejmQuery: "Polska",
});
const hit = {
  title: "Polska",
  url: "https://api.sejm.gov.pl/eli/acts/2026/1",
  raw_content: "Materiał encyklopedyczny dotyczący Polski.",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(corpus).mockResolvedValue({ hits: [], partial: false });
  vi.mocked(search).mockResolvedValue([]);
  vi.mocked(sejm).mockResolvedValue({ hits: [hit], partial: false });
});
describe("multi-source retrieval", () => {
  it("does not let catalog matches displace current web evidence", async () => {
    const article = (id: number) => ({
      title: `Komunikat ${id}`,
      url: `https://www.gov.pl/web/test/komunikat-${id}`,
      raw_content: `Unikalny komunikat numer ${id}. ${String.fromCharCode(65 + id).repeat(60)}`,
    });
    vi.mocked(corpus).mockResolvedValue({
      hits: [article(1), article(2), article(3)],
      partial: false,
    });
    vi.mocked(search).mockResolvedValueOnce([article(4)]);
    const found = await retrieve(plan, new AbortController().signal);
    const docs = prepareDocuments(
      found.hits,
      "Zdarzenie",
      "2026-11-22T00:00:00Z",
    );
    expect(docs.some((doc) => doc.url === article(4).url)).toBe(true);
  });
  it("retains an article from the second query before the publisher limit fills", async () => {
    const article = (id: number) => ({
      title: `Artykuł ${id}`,
      url: `https://demagog.org.pl/na-biezaco/test-${id}`,
      raw_content: `Unikalne zdarzenie numer ${id}. ${String.fromCharCode(65 + id).repeat(60)}`,
    });
    vi.mocked(search).mockImplementation(async (query, _signal, domain) =>
      domain !== "demagog.org.pl"
        ? []
        : query === plan.queries[0]
          ? [article(1), article(2), article(3)]
          : [article(4)],
    );
    const found = await retrieve(plan, new AbortController().signal);
    const docs = prepareDocuments(
      found.hits,
      "Zdarzenie",
      "2026-11-22T00:00:00Z",
    );
    expect(docs.some((doc) => doc.url === article(4).url)).toBe(true);
  });
  it("calls only relevant direct APIs", async () => {
    const result = await retrieve(plan, new AbortController().signal);
    expect(result.hits).toEqual([hit]);
    expect(sejm).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(6);
    for (const query of plan.queries)
      for (const domain of ["demagog.org.pl", "euvsdisinfo.eu", "gov.pl"])
        expect(search).toHaveBeenCalledWith(
          query,
          expect.any(AbortSignal),
          domain,
        );
    expect(wikipedia).not.toHaveBeenCalled();
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
    vi.mocked(sejm).mockRejectedValue(new Error("down"));
    await expect(
      retrieve(plan, new AbortController().signal),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
