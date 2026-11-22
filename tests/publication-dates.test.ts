import { afterEach, expect, it, vi } from "vitest";
import {
  enrichPublicationDates,
  publicationDateFromHtml,
} from "@/server/publication-dates";
import {
  clearSessionSearchCache,
  withSearchCache,
} from "@/server/search-cache";
import type { Document } from "@/core/contracts";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  clearSessionSearchCache("dates");
});

it("reads the publication dateline without substituting dates mentioned in the article", () => {
  expect(
    publicationDateFromHtml(
      '<main><p class="event-date">20.11.2026</p><p>Wydarzenie z 10.09.2025</p></main>',
    ),
  ).toBe("2026-11-20");
  expect(
    publicationDateFromHtml(
      "<main><p>20.11.2026 doszło do zdarzenia.</p></main>",
    ),
  ).toBeNull();
});

const doc = (): Document => ({
  id: "s1",
  title: "Artykuł testowy",
  url: "https://demagog.org.pl/na-biezaco/test/",
  publishedAt: null,
  retrievedAt: "2026-11-22T00:00:00Z",
  chunks: [],
});
it("reads the exact article directly without paid search or redirects", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response('<div class="dg-post__info">Autor · 20.11.2026</div>', {
        headers: { "content-type": "text/html" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const source = doc();
  await enrichPublicationDates([source], new AbortController().signal);
  expect(source.publishedAt).toBe("2026-11-20");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(source.url);
  expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
    redirect: "error",
    cache: "no-store",
  });
});
it("keeps the date unknown when HTML has no dateline or retrieval fails", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response("<p>Zdarzenie 20.11.2026.</p>", {
      headers: { "content-type": "text/html" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const source = doc();
  await enrichPublicationDates([source], new AbortController().signal);
  expect(source.publishedAt).toBeNull();
  fetcher.mockRejectedValue(new Error("timeout"));
  await enrichPublicationDates([source], new AbortController().signal);
  expect(source.publishedAt).toBeNull();
});

it("reuses known dates within the session and clears them on deletion", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response('<meta name="date" content="2026-11-20">', {
          headers: { "content-type": "text/html" },
        }),
    ),
  );
  for (let i = 0; i < 2; i++) {
    const source = doc();
    await withSearchCache("dates", () =>
      enrichPublicationDates([source], new AbortController().signal),
    );
    expect(source.publishedAt).toBe("2026-11-20");
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  clearSessionSearchCache("dates");
  await withSearchCache("dates", () =>
    enrichPublicationDates([doc()], new AbortController().signal),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not fetch unsupported hosts, credentials, ports, or known dates", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const sources = [
    "http://demagog.org.pl/na-biezaco/test",
    "https://demagog.org.pl.evil.test/na-biezaco/test",
    "https://user@demagog.org.pl/na-biezaco/test",
    "https://www.gov.pl:8443/web/test",
    "https://demagog.org.pl/login",
  ].map((url) => ({ ...doc(), url }));
  sources.push({ ...doc(), publishedAt: "2026-11-21" });
  await enrichPublicationDates(sources, new AbortController().signal);
  expect(fetch).not.toHaveBeenCalled();
});
