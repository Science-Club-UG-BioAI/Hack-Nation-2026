import { test, expect } from "@playwright/test";
test("source catalog is auditable and readable on mobile", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("/api/corpus");
  expect(response.ok()).toBe(true);
  const catalog = await response.json();
  expect(catalog.records.length).toBeGreaterThanOrEqual(100);
  expect(
    new Set(catalog.records.map((record: { type: string }) => record.type)),
  ).toEqual(new Set(["official", "fact_check"]));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Korpus źródeł", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Źródła pod kontrolą." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "demagog.org.pl", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Pobierz katalog JSON do audytu" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("corpus-mobile.png") });
});
