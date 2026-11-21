import { afterEach, expect, it, vi } from "vitest";
import {
  enrichPublicationDates,
  publicationDateFromHtml,
} from "@/server/publication-dates";
import { searchPublicationMetadata } from "@/server/providers";
import type { Document } from "@/core/contracts";
vi.mock("@/server/providers", () => ({ searchPublicationMetadata: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
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
it("accepts dates only for the same source URL", async () => {
  vi.mocked(searchPublicationMetadata).mockResolvedValue([
    {
      title: "Inny",
      url: "https://demagog.org.pl/na-biezaco/inny",
      published_date: "2025-09-10",
    },
    {
      title: "Test",
      url: "https://demagog.org.pl/na-biezaco/test",
      published_date: "2026-11-20",
    },
  ]);
  const source = doc();
  await enrichPublicationDates([source], new AbortController().signal);
  expect(source.publishedAt).toBe("2026-11-20");
});
it("keeps the date unknown when only other articles have dates or retrieval fails", async () => {
  vi.mocked(searchPublicationMetadata).mockResolvedValue([
    {
      title: "Other",
      url: "https://demagog.org.pl/na-biezaco/inny",
      published_date: "2025-09-10",
    },
  ]);
  const source = doc();
  await enrichPublicationDates([source], new AbortController().signal);
  expect(source.publishedAt).toBeNull();
  vi.mocked(searchPublicationMetadata).mockRejectedValue(new Error("timeout"));
  await enrichPublicationDates([source], new AbortController().signal);
  expect(source.publishedAt).toBeNull();
});
