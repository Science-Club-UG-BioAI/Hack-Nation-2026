import { test, expect } from "@playwright/test";
import { demoResult } from "../src/core/demo";
import { channelReply } from "../src/core/channel";

test("adapter automatically displays a response and works on a narrow screen", async ({
  page,
}, testInfo) => {
  await page.route("**/api/channels/discord-demo", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.content).toBe(
      "Wydatki wzrosły dwukrotnie w porównaniu z poprzednim okresem.",
    );
    const result = { ...demoResult("context")!, mode: "live" as const };
    await route.fulfill({ json: channelReply(result) });
  });
  await page.goto("/kanal-demo");
  await expect(page.getByText(/Nie łączymy się z Discordem/)).toBeVisible();
  await page
    .getByLabel("Treść wiadomości")
    .fill("Wydatki wzrosły dwukrotnie w porównaniu z poprzednim okresem.");
  await page.getByRole("button", { name: "Wyślij w symulatorze" }).click();
  await expect(page.locator(".message-bot")).toContainText(
    "Status obsługi: Potrzebne doprecyzowanie",
  );
  await expect(page.locator(".message-bot")).toContainText(
    "Nie wydano werdyktu",
  );
  await page
    .getByText("Pełny wynik i klikalne źródła", { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Potrzebne doprecyzowanie" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("adapter-mobile.png"),
    fullPage: true,
  });
});

test("adapter distinguishes a provider failure from a factual assessment", async ({
  page,
}) => {
  await page.route("**/api/channels/discord-demo", (route) =>
    route.fulfill({
      status: 503,
      json: {
        requestId: "test",
        status: "technical_error",
        code: "MODEL_UNAVAILABLE",
        message: "Model chwilowo niedostępny.",
        retryable: true,
      },
    }),
  );
  await page.goto("/kanal-demo");
  await page
    .getByLabel("Treść wiadomości")
    .fill("Polska przystąpiła do NATO 12 marca 1999 roku.");
  await page.getByRole("button", { name: "Wyślij w symulatorze" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Model chwilowo" }),
  ).toContainText("Nie wydano werdyktu");
  await expect(page.locator("article.evidence")).toHaveCount(0);
});
