import { test, expect, type Page } from "@playwright/test";
import { demoResult } from "../src/core/demo";
import type { VerificationEvent } from "../src/core/progress";

declare global {
  interface Window {
    pushVerificationFixture: (event: VerificationEvent) => void;
    endVerificationFixture: () => void;
  }
}

// Control only the verification transport; session management and the UI are real.
async function openStreamFixture(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, options) => {
      if (String(input) !== "/api/verify") return original(input, options);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          window.pushVerificationFixture = (event) =>
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          window.endVerificationFixture = () => controller.close();
          options?.signal?.addEventListener(
            "abort",
            () => controller.error(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        },
      });
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
  });
  await page.goto("/");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Polska przystąpiła do NATO 12 marca 1999 roku.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await page.waitForFunction(() => Boolean(window.pushVerificationFixture));
}
async function emit(page: Page, event: VerificationEvent) {
  await page.evaluate((event) => window.pushVerificationFixture(event), event);
}

test("real-time stages, source failures, activity log and final evidence stay consistent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openStreamFixture(page);
  await emit(page, { type: "stage", stage: "planning" });
  await expect(
    page.getByRole("heading", { name: "Rozpoznawanie tezy" }),
  ).toBeVisible();
  await expect(page.locator(".step-active")).toContainText("Rozpoznanie tezy");
  await emit(page, { type: "stage", stage: "searching" });
  await emit(page, {
    type: "source",
    source: { provider: "web", documents: 0, status: "running" },
  });
  await emit(page, {
    type: "source",
    source: { provider: "wikipedia", documents: 2, status: "ok" },
  });
  await emit(page, {
    type: "source",
    source: { provider: "sejm", documents: 0, status: "error" },
  });
  await expect(page.locator(".source-error")).toContainText("Niedostępne");
  await expect(page.locator(".verdict")).toHaveCount(0);
  await page.getByText("Dziennik aktywności", { exact: false }).click();
  await expect(page.locator(".activity-details ol")).toContainText(
    "Wikipedia API · pobrano materiały",
  );
  await page.screenshot({
    path: "reports/ui-live-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".step-active")).toContainText("Zbieranie źródeł");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "reports/ui-live-mobile.png", fullPage: true });
  await emit(page, {
    type: "source",
    source: { provider: "web", documents: 4, status: "ok" },
  });
  await emit(page, { type: "stage", stage: "assessing" });
  await emit(page, { type: "stage", stage: "auditing" });
  await expect(
    page.getByRole("heading", { name: "Kontrola wniosku" }),
  ).toBeVisible();
  await emit(page, {
    type: "result",
    result: { ...demoResult("nato")!, mode: "live" },
  });
  await expect(
    page.getByRole("heading", { name: "Potwierdzone", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pipeline-steps .step-done")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Sprawdź dowody" }),
  ).toBeEnabled();
  await expect(page.locator("article.evidence")).toHaveCount(2);
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Nowa teza wymagająca osobnej weryfikacji.");
  await expect(page.locator(".verdict")).toHaveCount(0);
  await expect(page.locator(".source-activity")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("cancelling a stream stops the current step and restores the form", async ({
  page,
}) => {
  await openStreamFixture(page);
  await emit(page, { type: "stage", stage: "searching" });
  await emit(page, {
    type: "source",
    source: { provider: "web", documents: 0, status: "running" },
  });
  await page.getByRole("button", { name: "Anuluj analizę" }).click();
  await expect(page.locator(".source-activity")).toContainText("Przerwano");
  await expect(page.locator(".source-activity")).not.toContainText(
    "Pobieranie…",
  );
  await expect(
    page.getByRole("heading", { name: "Analiza została anulowana" }),
  ).toBeVisible();
  await expect(page.locator(".step-stopped")).toContainText("Zbieranie źródeł");
  await expect(page.locator(".step-active")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sprawdź dowody" }),
  ).toBeEnabled();
  await expect(page.locator(".verdict")).toHaveCount(0);
});

test("an interrupted stream shows a retryable error without a verdict", async ({
  page,
}) => {
  await openStreamFixture(page);
  await emit(page, { type: "stage", stage: "assessing" });
  await page.evaluate(() => window.endVerificationFixture());
  await expect(page.locator(".error-panel")).toContainText(
    "Nie udało się połączyć",
  );
  await expect(
    page.getByRole("button", { name: "Spróbuj ponownie" }),
  ).toBeEnabled();
  await expect(page.locator(".verdict")).toHaveCount(0);
});

test("dashboard has no horizontal overflow at phone, tablet and desktop widths", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `width ${width}`,
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Błędna data", exact: true }).click();
  await expect(page.locator(".verdict-refuted")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Przykład demonstracyjny" }),
  ).toBeVisible();
  await expect(page.locator(".step-done")).toHaveCount(0);
});
