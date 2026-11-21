import { describe, expect, it } from "vitest";
import { factCheck } from "@/server/fact-check";
describe.skipIf(process.env.RUN_SOURCE_LIVE_TESTS !== "1")(
  "trusted fact-check indexes",
  () => {
    it("retrieves reviews from Google Fact Check", async () => {
      const hits = await factCheck(
        "rakiety polska",
        AbortSignal.timeout(20000),
      );
      expect(hits.length).toBeGreaterThan(0);
      for (const hit of hits) {
        expect(hit.provider).toBe("google_factcheck");
        expect(hit.contentScope).toBe("metadata");
      }
    }, 25000);
  },
);
