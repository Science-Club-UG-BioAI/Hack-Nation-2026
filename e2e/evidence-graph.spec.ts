import { expect, test } from "@playwright/test";

for (const outcome of [
  { status: "completed", verdict: "supported", label: "Potwierdzone" },
  {
    status: "unable_to_verify",
    verdict: null,
    label: "Nie można ukończyć sprawdzenia",
  },
]) {
  test(`optional graph does not replace the shared ${outcome.status} outcome`, async ({
    page,
  }) => {
    await page.route("**/api/demo?id=synthetic-graph", async (route) => {
      const response = await route.fetch();
      const result = await response.json();
      await route.fulfill({
        json: { ...result, status: outcome.status, verdict: outcome.verdict },
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: /Graf dowodowy · dane syntetyczne/i })
      .click();
    await expect(page.locator("#result-title")).toHaveText(outcome.label);
    await expect(
      page.getByText("Dodatkowa ocena grafu", { exact: true }),
    ).toBeVisible();
    if (outcome.verdict === null)
      await expect(
        page.getByText(
          "To status obsługi zgłoszenia. Nie wydano werdyktu o prawdziwości.",
        ),
      ).toBeVisible();
  });
}

test("syntetyczny graf pozwala przejść od werdyktu do dokumentu i wyeksportować graf", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Graf dowodowy · dane syntetyczne/i })
    .click();
  const graph = page.getByRole("region", { name: "Graf dowodowy" });
  await expect(
    graph.getByText("Dane syntetyczne.", { exact: true }),
  ).toBeVisible();
  await expect(graph.locator("canvas").first()).toBeAttached();
  const next = graph.getByLabel("Przejdź do elementu");
  await graph
    .getByRole("button", { name: /Wyprowadzono z · Fałszywe/ })
    .click();
  await graph
    .getByRole("button", { name: /Wyprowadzono z · Uchwała nie wprowadza/ })
    .click();
  await expect(graph.getByText("Przesłanki", { exact: true })).toBeVisible();
  await graph
    .getByRole("button", { name: /Zależy od przesłanki · Od 1 grudnia/ })
    .click();
  await expect(graph.locator("blockquote")).toContainText("wyłącznie dzieciom");
  await expect(
    graph.getByText("Fikcyjna uchwała rady", { exact: true }),
  ).toBeVisible();
  await graph
    .getByText("Pokaż zapisany fragment źródła", { exact: true })
    .click();
  await expect(graph.locator("mark")).toContainText("wyłącznie dzieciom");
  await next.selectOption("document-1");
  await expect(graph.getByText(/SHA-256 migawki/)).toBeVisible();
  await graph.getByRole("button", { name: "Dopasuj widok" }).click();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    graph.getByRole("button", { name: "Eksport JSON" }).click(),
  ]);
  expect(json.suggestedFilename()).toBe("graf-dowodowy.json");
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    graph.getByRole("button", { name: "Eksport PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toBe("graf-dowodowy.png");
});

test("graf na telefonie mieści się w ekranie i pozwala filtrować elementy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Graf dowodowy · dane syntetyczne/i })
    .click();
  const graph = page.getByRole("region", { name: "Graf dowodowy" });
  await expect(graph.locator("canvas").first()).toBeAttached();
  await graph.getByLabel("Węzły").selectOption("DOCUMENT");
  const picker = graph.getByLabel("Przejdź do elementu");
  await expect(picker.locator("option")).toHaveCount(3);
  await picker.selectOption("document-1");
  await expect(graph.getByText(/SHA-256 migawki/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});
