import { describe, expect, it } from "vitest";
import { sejm } from "@/server/source-adapters";

describe.skipIf(process.env.RUN_SOURCE_LIVE_TESTS !== "1")(
  "opt-in public API integration",
  () => {
    it.each([
      ["sejm", sejm, "Konstytucja Rzeczypospolitej Polskiej", "metadata"],
    ] as const)(
      "retrieves real %s material",
      async (provider, adapter, query, scope) => {
        const result = await adapter(query, AbortSignal.timeout(20_000));
        expect(result.hits.length).toBeGreaterThan(0);
        expect(result.hits.some((hit) => hit.contentScope === scope)).toBe(
          true,
        );
        for (const hit of result.hits) {
          expect(hit.provider).toBe(provider);
          expect(hit.raw_content!.length).toBeGreaterThan(40);
          expect(hit.url).toMatch(/^https:\/\//);
        }
      },
      25_000,
    );
  },
);
