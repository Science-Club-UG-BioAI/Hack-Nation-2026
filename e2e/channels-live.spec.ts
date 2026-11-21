import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.describe("opt-in live channel initiation", () => {
  test.skip(process.env.RUN_LIVE_TESTS !== "1", "Uses real external APIs.");
  test.setTimeout(90_000);
  for (const scenario of [
    {
      name: "misleading",
      claim:
        "Polska jest członkiem Unii Europejskiej od 2004 roku, czyli od tego czasu obowiązującą w Polsce walutą jest euro.",
      status: "completed",
      verdict: "misleading",
      label: "Wprowadzające w błąd",
    },
    {
      name: "clarification",
      claim: "Wydatki wzrosły dwukrotnie w porównaniu z poprzednim okresem.",
      status: "needs_clarification",
      verdict: null,
      label: "Potrzebne doprecyzowanie",
    },
  ])
    test(scenario.name, async ({ page }, testInfo) => {
      await page.goto("/kanal-demo");
      await page.getByLabel("Treść wiadomości").fill(scenario.claim);
      const pending = page.waitForResponse(
        (r) => r.url().endsWith("/api/channels/discord-demo"),
        { timeout: 70_000 },
      );
      await page.getByRole("button", { name: "Wyślij w symulatorze" }).click();
      const response = await pending;
      const body = await response.json();
      await writeFile(
        testInfo.outputPath("channel-result.json"),
        JSON.stringify(body, null, 2),
      );
      expect(response.status(), JSON.stringify(body)).toBe(200);
      expect(body.result, JSON.stringify(body)).toMatchObject({
        status: scenario.status,
        verdict: scenario.verdict,
        mode: "live",
        delivery: { channel: "discord_demo", reused: false },
      });
      expect(body.messages.join("\n")).toContain(scenario.label);
      if (scenario.verdict) {
        expect(body.result.evidence.length).toBeGreaterThanOrEqual(2);
        for (const evidence of body.result.evidence)
          expect(body.messages.join("\n")).toContain(evidence.quote);
      } else {
        expect(body.result.evidence).toEqual([]);
        expect(body.messages.join("\n")).toContain("Nie wydano werdyktu");
      }
      await expect(page.locator(".message-bot").first()).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("channel.png"),
        fullPage: true,
      });
      // Reverse direction: WWW uses the same analysis created by the adapter.
      await page.goto("/");
      await page.getByLabel("Twierdzenie do sprawdzenia").fill(scenario.claim);
      const webPending = page.waitForResponse(
        (r) => r.url().endsWith("/api/verify"),
        { timeout: 70_000 },
      );
      await page.getByRole("button", { name: "Sprawdź dowody" }).click();
      const webResponse = await webPending;
      expect(webResponse.status()).toBe(200);
      const web = await webResponse.json();
      expect(web).toMatchObject({
        requestId: body.result.requestId,
        status: scenario.status,
        verdict: scenario.verdict,
        evidence: body.result.evidence,
        sources: body.result.sources,
        delivery: { channel: "web", reused: true },
      });
      await expect(
        page.getByRole("heading", { name: scenario.label }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("web.png"),
        fullPage: true,
      });
    });
});
