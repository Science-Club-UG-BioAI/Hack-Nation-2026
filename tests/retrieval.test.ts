import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { retrieve } from "@/server/retrieval";
import { prepareDocuments } from "@/core/evidence";
import { quotationCatalog } from "@/core/quotations";
import { planSchema } from "@/core/contracts";
vi.mock("@/server/corpus", () => ({
  corpus: vi.fn(async () => ({ hits: [], partial: false })),
}));
const plan = planSchema.parse({
  checkable: true,
  needsClarification: false,
  explanation: "test",
  factCheckQueries: ["polska nato", "akcesja nato"],
  queries: ["NATO data", "NATO akcesja"],
  euvsdisinfoQuery: "NATO",
});
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher.mockReset());
  vi.stubEnv("GOOGLE_FACTCHECK_API_KEY", "fixture");
  vi.stubEnv("EUVSDISINFO_API_KEY", "fixture");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("contacts only the approved indexes and never follows indexed review URLs", async () => {
  fetcher.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(init?.redirect).toBe("error");
    if (url.origin === "https://mcp.euvsd.info")
      return Response.json({
        jsonrpc: "2.0",
        result: { structuredContent: { results: [] } },
      });
    expect(url.origin + url.pathname).toBe(
      "https://factchecktools.googleapis.com/v1alpha1/claims:search",
    );
    expect(new Headers(init?.headers).get("X-Goog-Api-Key")).toBe("fixture");
    expect(url.searchParams.has("reviewPublisherSiteFilter")).toBe(false);
    const claimReview = ["demagog.org.pl", "other.example"].map((host) => ({
      url: "https://" + host + "/review",
      textualRating: "Fałsz",
      reviewDate: "2026-01-01",
      title: "Ocena redakcji",
    }));
    return Response.json({
      claims: [
        { text: "Oryginalna teza wymagająca sprawdzenia.", claimReview },
      ],
    });
  });
  const result = await retrieve(plan, new AbortController().signal);
  expect(
    result.statuses.every((s) => s.status === "ok" || s.status === "empty"),
  ).toBe(true);
  expect(result.statuses.map((s) => s.provider).sort()).toEqual([
    "corpus",
    "euvsdisinfo",
    "google_factcheck",
  ]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const queries = fetcher.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.hostname === "factchecktools.googleapis.com")
    .map((url) => url.searchParams.get("query"));
  expect(queries.sort()).toEqual([...plan.factCheckQueries].sort());
  expect(
    result.hits.find((h) => h.provider === "google_factcheck"),
  ).toMatchObject({
    contentScope: "metadata",
    raw_content: expect.stringContaining("Ocena wydawcy: Fałsz"),
  });
});
it("sends a single compact topic when two planner phrases reduce to the same search", async () => {
  const claim = "Wczoraj w Polsce spadły dwie rakiety i jeden dron.";
  fetcher.mockResolvedValue(Response.json({}));
  await retrieve(
    {
      ...plan,
      queries: [claim, "Czy 20 listopada 2026 r. odnotowano upadek drona?"],
      factCheckQueries: [
        "Rakiety Polska dron zgłoszenie",
        "rakiety POLSKA dron",
      ],
      euvsdisinfoQuery: null,
    },
    new AbortController().signal,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("query")).toBe("rakiety polska dron");
});
it("attributes a Demagog review to its publisher once across Google Fact Check queries", async () => {
  vi.stubEnv("EUVSDISINFO_API_KEY", "");
  const claimText = "Fragment tezy. ".repeat(52).trim();
  fetcher.mockImplementation(async () =>
    Response.json({
      claims: [
        {
          text: claimText,
          claimReview: [
            {
              url: "https://demagog.org.pl/fake_news/example",
              publisher: { name: "Demagog" },
              textualRating: "Fałsz",
            },
          ],
        },
      ],
    }),
  );
  const result = await retrieve(plan, new AbortController().signal);
  const documents = prepareDocuments(result.hits, claimText, "2026-11-21");
  expect(documents).toHaveLength(1);
  expect(documents[0]).toMatchObject({
    provider: "google_factcheck",
    publisher: "Demagog",
    publisherGroup: "demagog.org.pl",
    contentScope: "metadata",
  });
  expect(
    [...quotationCatalog(documents).quotes.values()].map((q) => q.quote),
  ).toEqual([`Sprawdzana teza: ${claimText} · Ocena wydawcy: Fałsz`]);
});
it("retains available indexed evidence and reports partial retrieval when a query fails", async () => {
  vi.stubEnv("EUVSDISINFO_API_KEY", "");
  fetcher.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("query") === plan.factCheckQueries[1])
      return new Response(null, { status: 503 });
    return Response.json({
      claims: [
        {
          text: "Teza kontrolna",
          claimReview: [
            { url: "https://demagog.org.pl/ocena", textualRating: "Fałsz" },
          ],
        },
      ],
    });
  });
  const result = await retrieve(plan, new AbortController().signal);
  expect(result.statuses).toContainEqual({
    provider: "google_factcheck",
    documents: 1,
    status: "partial",
  });
  expect(result.hits).toHaveLength(1);
});
it("exposes missing keys and never runs web search as a fallback", async () => {
  vi.stubEnv("GOOGLE_FACTCHECK_API_KEY", "");
  vi.stubEnv("EUVSDISINFO_API_KEY", "");
  const result = await retrieve(plan, new AbortController().signal);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    result.statuses
      .filter((s) => s.status === "not_configured")
      .map((s) => s.provider)
      .sort(),
  ).toEqual(["euvsdisinfo", "google_factcheck"]);
});
it("never falls back to the open web on an index outage", async () => {
  fetcher.mockRejectedValue(new Error("offline"));
  await expect(
    retrieve(plan, new AbortController().signal),
  ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  expect(
    new Set(
      fetcher.mock.calls.map(([input]) => new URL(String(input)).hostname),
    ),
  ).toEqual(new Set(["factchecktools.googleapis.com", "mcp.euvsd.info"]));
});
