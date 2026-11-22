import { expect, it } from "vitest";
import catalog from "../data/corpus/catalog.json";
import { corpus } from "@/server/corpus";

// Direct public HTML requests only; no search or model provider is called.
const articles = catalog.records.filter(
  (record) =>
    record.type === "fact_check" && record.domain === "demagog.org.pl",
);
it.skipIf(process.env.RUN_CORPUS_LIVE_TESTS !== "1").each(articles)(
  "fetches the catalogued Demagog article: $title",
  async (record) => {
    const result = await corpus(record.title, AbortSignal.timeout(15_000));
    const hit = result.hits.find((item) => item.url === record.url);
    expect(hit).toMatchObject({
      provider: "corpus",
      publisher: "Stowarzyszenie Demagog",
      published_date: record.publishedAt,
      contentScope: "text",
    });
    expect(hit!.raw_content!.length).toBeGreaterThan(500);
    expect(hit!.raw_content).not.toMatch(
      /access denied|just a moment|attention required|robot check/i,
    );
  },
  20_000,
);
