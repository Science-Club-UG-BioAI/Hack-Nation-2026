import { test, expect } from "@playwright/test";

test("cancellation clears progress and allows a new analysis", async ({
  page,
}) => {
  let requested!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let release!: () => void;
  const waitForCancellation = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/verify", async (route) => {
    requested();
    await waitForCancellation;
    await route.abort();
  });
  await page.goto("/");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Polska przystąpiła do NATO 12 marca 1999 roku.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await requestStarted;
  await page.getByRole("button", { name: "Anuluj" }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Sprawdź dowody" }),
  ).toBeEnabled();
  await expect(page.locator(".error-panel")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Potwierdzenie", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Potwierdzone" }),
  ).toBeVisible();
});

test("malformed error responses remain recoverable without crashing the UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/verify", (route) =>
    route.fulfill({ status: 502, json: { message: { unexpected: true } } }),
  );
  await page.goto("/");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Polska przystąpiła do NATO 12 marca 1999 roku.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(page.locator(".error-panel")).toContainText(
    "Nie udało się połączyć z serwerem",
  );
  await expect(
    page.getByRole("button", { name: "Spróbuj ponownie" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("billing error explains the cause without suggesting an ineffective retry", async ({
  page,
}) => {
  await page.route("**/api/verify", (route) =>
    route.fulfill({
      status: 503,
      json: {
        requestId: "billing-test",
        code: "PROVIDER_PAYMENT_REQUIRED",
        message:
          "Google zgłasza problem z rozliczeniami lub brak środków. Sprawdź Billing w Google AI Studio.",
        retryable: false,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Polska przystąpiła do NATO 12 marca 1999 roku.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Google zgłasza problem" }),
  ).toContainText("brak środków");
  await expect(
    page.getByRole("button", { name: "Spróbuj ponownie" }),
  ).toHaveCount(0);
  await expect(page.locator("article.evidence")).toHaveCount(0);
});

test("multiple evidence cards, provenance, provider failures and mobile layout", async ({
  page,
}, testInfo) => {
  const now = "2026-11-21T10:00:00Z";
  const sources = [
    {
      id: "s1",
      title: "Artykuł encyklopedyczny",
      url: "https://pl.wikipedia.org/w/index.php?oldid=123",
      provider: "wikipedia",
      contentScope: "text",
      notes: ["Konkretna wersja artykułu."],
      publishedAt: null,
      retrievedAt: now,
    },
    {
      id: "s2",
      title: "Oficjalny rejestr aktu",
      url: "https://api.sejm.gov.pl/eli/acts/DU/1997/483",
      provider: "sejm",
      contentScope: "metadata",
      notes: ["Nie pobrano treści przepisów ani PDF."],
      publishedAt: null,
      retrievedAt: now,
    },
    {
      id: "s3",
      title: "Praca naukowa",
      url: "https://arxiv.org/abs/1706.03762",
      provider: "arxiv",
      contentScope: "abstract",
      notes: [],
      publishedAt: null,
      retrievedAt: now,
    },
  ];
  await page.route("**/api/verify", (route) =>
    route.fulfill({
      json: {
        requestId: "fixture",
        mode: "live",
        status: "completed",
        claim: "Twierdzenie testowe z kilkoma materiałami źródłowymi.",
        statedAt: null,
        checkedAt: now,
        verdict: "insufficient",
        explanation: "Dostępne materiały nie wystarczają do rozstrzygnięcia.",
        limitations: ["Część wyszukiwania WWW była niedostępna."],
        sources,
        coverage: {
          citedSources: 2,
          publisherGroups: 2,
          reviewedSources: 3,
          minimumGroups: 2,
        },
        retrieval: [
          { provider: "web", status: "partial", documents: 2 },
          { provider: "wikipedia", status: "ok", documents: 1 },
        ],
        evidence: sources.slice(0, 2).map((source) => ({
          sourceId: source.id,
          chunkId: `${source.id}:p0`,
          quote: "Fragment materiału źródłowego wykorzystany jako kontekst.",
          relation: "context",
          relevance: "Materiał daje tylko częściowy kontekst.",
        })),
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Twierdzenie testowe z kilkoma materiałami źródłowymi.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(page.locator("article.evidence")).toHaveCount(2);
  await expect(
    page.getByText("Cytowane źródła: 2 · Grupy wydawców: 2"),
  ).toBeVisible();
  await expect(page.getByText("Sejm / ELI API · Tylko metadane")).toBeVisible();
  await page.getByText("Gdzie szukaliśmy dowodów", { exact: true }).click();
  await expect(
    page.getByText(/Wyszukiwanie WWW: część materiałów niedostępna/),
  ).toBeVisible();
  await page
    .getByText("Pozostałe przejrzane materiały — bez zatwierdzonego cytatu", {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: /Praca naukowa.*tylko abstrakt/ }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("multi-evidence-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("multi-evidence-mobile.png"),
    fullPage: true,
  });
});

test("demo result, evidence, changed claim and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Zacznij od jednej tezy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sprawdź dowody" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Potwierdzenie", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Potwierdzone" }),
  ).toBeVisible();
  await expect(
    page.getByText("Przykład demonstracyjny przygotowany ręcznie.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Poland and NATO" }),
  ).toHaveAttribute("href", /nato.int/);
  const citation = page.getByRole("link", { name: "Dowód 2", exact: true });
  await expect(citation).toHaveAttribute("href", "#evidence-2");
  await citation.click();
  await expect(page.locator("#evidence-2 blockquote")).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Nowa teza wymagająca oddzielnej weryfikacji.");
  await expect(page.getByRole("heading", { name: "Potwierdzone" })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Brak kontekstu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Potrzebne doprecyzowanie" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("a technical error does not render a verdict or an automatic demo", async ({
  page,
}) => {
  await page.route("**/api/verify", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "test",
        code: "PROVIDER_ERROR",
        message: "Usługa niedostępna.",
        retryable: true,
      }),
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Polska przystąpiła do NATO 12 marca 1999 roku.");
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Nie udało się ukończyć analizy" }),
  ).toContainText("Błąd techniczny nie oznacza");
  await expect(
    page.getByRole("button", { name: "Spróbuj ponownie" }),
  ).toBeVisible();
  await expect(
    page.getByText("Przykład demonstracyjny przygotowany ręcznie.", {
      exact: false,
    }),
  ).toHaveCount(0);
});
