import { afterEach, expect, it, vi } from "vitest";
import {
  cachedSearch,
  clearSessionSearchCache,
  withSearchCache,
} from "@/server/search-cache";
import { clearSessionVerifications } from "@/server/verification-service";
import { search, searchContext } from "@/server/providers";
import { prepareDocuments } from "@/core/evidence";
import { usageContext, type UsageCall } from "@/server/config";
const signal = () => new AbortController().signal;
afterEach(() => {
  for (const session of ["cache-a", "cache-b"])
    clearSessionSearchCache(session);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("isolates sessions, clones values, expires without sliding TTL, and bypasses unscoped calls", async () => {
  vi.useFakeTimers();
  const load = vi.fn(async () => ({ text: "original" }));
  const run = () => cachedSearch("query", signal(), load);
  const first = await withSearchCache("cache-a", run);
  first.value.text = "modified";
  vi.advanceTimersByTime(299_000);
  expect(await withSearchCache("cache-a", run)).toEqual({
    value: { text: "original" },
    reused: true,
  });
  await withSearchCache("cache-b", run);
  await run();
  await run();
  expect(load).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(1_001);
  expect((await withSearchCache("cache-a", run)).reused).toBe(false);
  expect(load).toHaveBeenCalledTimes(5);
});
it("does not store failures, empty search results, oversized values or aborted responses", async () => {
  await withSearchCache("cache-a", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["ok"]);
    const run = () =>
      cachedSearch<string[]>(
        "query",
        signal(),
        load,
        300_000,
        (v) => v.length > 0,
      );
    await expect(run()).rejects.toThrow("offline");
    await run();
    await run();
    expect(load).toHaveBeenCalledTimes(3);
    const large = vi.fn(async () => "x".repeat(2 * 1024 * 1024 + 1));
    await cachedSearch("large", signal(), large);
    await cachedSearch("large", signal(), large);
    expect(large).toHaveBeenCalledTimes(2);
    const controller = new AbortController();
    await expect(
      cachedSearch("abort", controller.signal, async () => {
        controller.abort();
        return "done";
      }),
    ).rejects.toThrow();
    const fresh = vi.fn(async () => "fresh");
    expect((await cachedSearch("abort", signal(), fresh)).reused).toBe(false);
  });
});
it("session erasure clears results and a pending fetch cannot repopulate them", async () => {
  let finish!: (value: string) => void;
  const pending = withSearchCache("cache-a", () =>
    cachedSearch(
      "late",
      signal(),
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  clearSessionVerifications("cache-a");
  finish("old session");
  await pending;
  const fresh = vi.fn(async () => "new session");
  expect(
    await withSearchCache("cache-a", () =>
      cachedSearch("late", signal(), fresh),
    ),
  ).toEqual({ value: "new session", reused: false });
});
it("limits the number of retained search results", async () => {
  await withSearchCache("cache-a", async () => {
    for (let i = 0; i < 129; i++)
      await cachedSearch(String(i), signal(), async () => i);
    const reload = vi.fn(async () => 0);
    expect((await cachedSearch("0", signal(), reload)).reused).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
it("charges only real Tavily calls and preserves the original retrieval timestamp", async () => {
  vi.stubEnv("TAVILY_API_KEY", "key-a");
  const raw =
    "Pełny tekst źródłowy o przystąpieniu Polski do NATO w roku 1999.";
  const fetcher = vi.fn(async () =>
    Response.json({
      results: [
        { title: "Artykuł", url: "https://gov.pl/web/test", raw_content: raw },
      ],
      usage: { credits: 2 },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const calls: UsageCall[] = [];
  await usageContext.run(calls, () =>
    withSearchCache("cache-a", async () => {
      const first = await search("Polska NATO", signal());
      const next = await search("Polska NATO", signal());
      expect(next[0].notes?.join(" ")).toContain("ponownie");
      const documents = prepareDocuments(
        next,
        "Polska NATO",
        "2099-01-01T00:00:00Z",
      );
      expect(documents[0].retrievedAt).toBe(first[0].retrievedAt);
      expect(calls).toHaveLength(1);
      vi.stubEnv("TAVILY_API_KEY", "key-b");
      await search("Polska NATO", signal());
      expect(calls).toHaveLength(2);
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("uses Basic only for planning context, retaining Advanced raw evidence and domain filtering", async () => {
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) =>
    Response.json({ results: [], usage: { credits: 1 } }),
  );
  vi.stubGlobal("fetch", fetcher);
  await searchContext("teza", signal());
  await search("teza", signal());
  const bodies = fetcher.mock.calls.map(([, init]) =>
    JSON.parse(init!.body as string),
  );
  expect(bodies[0]).toMatchObject({
    search_depth: "basic",
    include_raw_content: false,
  });
  expect(bodies[1]).toMatchObject({
    search_depth: "advanced",
    include_raw_content: true,
    include_domains: ["demagog.org.pl", "euvsdisinfo.eu", "gov.pl"],
  });
});
