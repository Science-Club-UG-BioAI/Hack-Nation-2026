import { syntheticGraphDemo } from "../src/server/demo-graph";
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
          window.pushVerificationFixture = (event) => {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
            );
            if (event.type === "result" || event.type === "error")
              delete (window as Partial<Window>).pushVerificationFixture;
          };
          window.endVerificationFixture = () => {
            delete (window as Partial<Window>).pushVerificationFixture;
            controller.close();
          };
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
  await page.getByText("Pokaż przebieg analizy", { exact: true }).click();
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
    source: { provider: "arxiv", documents: 1, status: "ok" },
  });
  await emit(page, {
    type: "source",
    source: { provider: "sejm", documents: 0, status: "error" },
  });
  await expect(page.locator(".source-error")).toContainText("Niedostępne");
  await expect(page.locator(".source-activity")).not.toContainText(
    /Wikipedia|arXiv/i,
  );
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
  await page.route("**/api/verify", (route) =>
    route.fulfill({ json: demoResult("eu") }),
  );
  await page.getByLabel("Twierdzenie do sprawdzenia").fill("Błędna data.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(page.locator(".verdict-refuted")).toBeVisible();
  await expect(page.locator(".demo-notice")).toBeVisible();
  await expect(page.locator(".step-done")).toHaveCount(0);
});

test("keeps the query form in view while scrolling a desktop report", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const result = demoResult("nato")!;
  await page.route("**/api/verify", (route) =>
    route.fulfill({
      json: {
        ...result,
        evidence: Array.from({ length: 5 }, () => result.evidence).flat(),
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Twierdzenie do sprawdzenia").fill("Polska w NATO.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(page.locator("article.evidence")).toHaveCount(10);
  await page.evaluate(() => window.scrollTo(0, 500));
  const formColumn = page.locator(".dashboard-workspace > .input-column");
  await expect(formColumn).toHaveCSS("position", "sticky");
  await expect.poll(async () => (await formColumn.boundingBox())?.y).toBe(16);
  await expect(
    page.getByRole("heading", { name: "Sprawdź tezę" }),
  ).toBeInViewport();
});

test("shows optional evidence metadata and keeps a clear fallback for older results", async ({
  page,
}) => {
  await openStreamFixture(page);
  const baseline = demoResult("nato")!;
  const rich = {
    ...baseline,
    mode: "live" as const,
    strength: {
      summary: "Dwie grupy wydawców, treść dotyczy okresu tezy.",
      independentGroups: 2,
      limitations: ["Obie publikacje mogą cytować ten sam komunikat."],
    },
    sources: baseline.sources.map((source, index) =>
      index
        ? {
            ...source,
            publishedAt: null,
            publisher: "gov.pl",
            publisherIsDomain: true,
          }
        : {
            ...source,
            publishedAt: "1999-03-12",
            updatedAt: "Sat, 13 Mar 1999 10:00:00 GMT",
            eventPeriod: { from: "1999-03-01", to: "1999-03-31" },
            publisher: "Redakcja archiwum",
            freshnessWarning: "Materiał archiwalny z marca 1999 r.",
          },
    ),
  };
  await emit(page, { type: "result", result: rich });
  await page.getByText("Szczegóły analizy", { exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Siła podstawy" }),
  ).toContainText(rich.strength.summary);
  await expect(page.getByText(rich.strength.limitations[0])).toBeVisible();
  const evidence = page.locator(".evidence-list");
  for (const summary of await evidence
    .getByText("Metadane źródła", { exact: true })
    .all())
    await summary.click();
  await expect(
    evidence.getByText("Wydawca · Redakcja archiwum", { exact: false }),
  ).toBeVisible();
  await expect(
    evidence.getByText("Domena źródła (zamiast nazwy wydawcy) · gov.pl", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(evidence.locator('time[datetime="1999-03-12"]')).toBeVisible();
  await expect(
    evidence.locator('time[datetime="1999-03-13T10:00:00.000Z"]'),
  ).toHaveText("13 mar 1999");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Kopiuj wynik", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Skopiowano", exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Publikacja · 1999-03-12");
  expect(copied).toContain("Aktualizacja · 13 mar 1999");
  expect(copied).toContain("Publikacja · data nieustalona");
  expect(copied).toContain("Pobrano ·");
  await expect(
    evidence.getByText("1999-03-01 – 1999-03-31", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    evidence.getByText("Materiał archiwalny z marca 1999 r."),
  ).toBeVisible();
  await expect(
    evidence.getByText("Publikacja · brak daty", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(
    page.getByRole("button", { name: "Anuluj analizę" }),
  ).toBeVisible();
  await page.waitForFunction(() => Boolean(window.pushVerificationFixture));
  await emit(page, { type: "result", result: { ...baseline, mode: "live" } });
  await expect(
    page.getByRole("heading", { name: "Potwierdzone", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Siła podstawy" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Materiał archiwalny z marca 1999 r."),
  ).toHaveCount(0);
  await evidence.getByText("Metadane źródła", { exact: true }).first().click();
  await expect(evidence.getByText(/Domena źródła/).first()).toBeVisible();
});

test("supports keyboard navigation to the result and graph controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Przejdź do weryfikacji" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace")).toBeFocused();
  await page.route("**/api/verify", (route) =>
    route.fulfill({ json: syntheticGraphDemo() }),
  );
  await page.getByLabel("Twierdzenie do sprawdzenia").fill("Teza testowa.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  const summary = page.getByText("Pokaż graf dowodowy", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  const graph = page.getByRole("region", { name: "Graf dowodowy" });
  await expect(graph).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fałszywe", exact: true }),
  ).toBeVisible();
  await graph.getByText("Opcje grafu", { exact: true }).click();
  const filter = graph.getByLabel("Węzły");
  for (let index = 0; index < 18; index++) {
    if (await filter.evaluate((select) => select === document.activeElement))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(filter).toBeFocused();
  expect(
    await filter.evaluate((select) => getComputedStyle(select).outlineStyle),
  ).toBe("solid");
  await page.keyboard.press("ArrowDown");
  await expect(filter).toHaveValue("CLAIM");
});
