import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.describe("opt-in live providers (uses API credits)", () => {
  test.skip(
    process.env.RUN_LIVE_TESTS !== "1",
    "Set RUN_LIVE_TESTS=1 to call real paid APIs.",
  );
  test.setTimeout(90_000);
  for (const scenario of [
    {
      id: "nato",
      claim: "Polska przystąpiła do NATO 12 marca 1999 roku.",
      verdict: "supported",
      label: "Potwierdzone",
    },
    {
      id: "eu",
      claim: "Polska przystąpiła do Unii Europejskiej w 1999 roku.",
      verdict: "refuted",
      label: "Fałszywe",
    },
  ]) {
    test(scenario.id, async ({ page }, testInfo) => {
      await page.goto("/");
      await page.getByLabel("Twierdzenie do sprawdzenia").fill(scenario.claim);
      const responsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/api/verify"),
        { timeout: 70_000 },
      );
      await page.getByRole("button", { name: "Sprawdź dowody" }).click();
      const response = await responsePromise;
      const result = await response.json();
      await writeFile(
        testInfo.outputPath("live-result.json"),
        JSON.stringify(result, null, 2),
      );
      await testInfo.attach("live-result", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      expect(response.status(), JSON.stringify(result)).toBe(200);
      expect(result.mode).toBe("live");
      expect(result.verdict, JSON.stringify(result)).toBe(scenario.verdict);
      expect(result.evidence.length).toBeGreaterThanOrEqual(2);
      expect(result.coverage.citedSources).toBeGreaterThanOrEqual(2);
      await expect(page.locator("article.evidence")).toHaveCount(
        result.evidence.length,
      );
      expect(result.coverage.publisherGroups).toBeGreaterThanOrEqual(2);
      expect(
        result.retrieval.some(
          (item: { provider: string; status: string }) =>
            item.provider === "wikipedia" && item.status === "ok",
        ),
      ).toBe(true);
      await expect(page.getByText(/Cytowane źródła:/)).toBeVisible();
      await expect(
        page.getByRole("heading", { name: scenario.label }),
      ).toBeVisible();
      await expect(
        page.getByText("Przykład demonstracyjny przygotowany ręcznie.", {
          exact: false,
        }),
      ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath("live.png"),
        fullPage: true,
      });
      await page.goto("/kanal-demo");
      await page.getByLabel("Treść wiadomości").fill(scenario.claim);
      const adapterResponse = page.waitForResponse(
        (r) => r.url().endsWith("/api/channels/discord-demo"),
        { timeout: 70_000 },
      );
      await page.getByRole("button", { name: "Wyślij w symulatorze" }).click();
      const adapted = await adapterResponse;
      expect(adapted.status()).toBe(200);
      const channel = await adapted.json();
      await writeFile(
        testInfo.outputPath("channel-result.json"),
        JSON.stringify(channel, null, 2),
      );
      expect(channel.delivery).toBe("simulated");
      expect(channel.result).toMatchObject({
        status: "completed",
        requestId: result.requestId,
        verdict: result.verdict,
        sources: result.sources,
        evidence: result.evidence,
        delivery: { reused: true },
      });
      await expect(page.locator(".message-bot").first()).toBeVisible();
      const text = channel.messages.join("\n");
      for (const evidence of result.evidence)
        expect(text).toContain(evidence.quote);
      await page.screenshot({
        path: testInfo.outputPath("channel.png"),
        fullPage: true,
      });
    });
  }
});
