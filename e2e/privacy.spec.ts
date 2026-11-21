import { test, expect } from "@playwright/test";

test("session erasure clears both open channels and exports only that session", async ({
  page,
  context,
}, testInfo) => {
  const second = await context.newPage();
  await page.goto("/");
  await second.goto("/kanal-demo");
  await page
    .getByLabel("Twierdzenie do sprawdzenia")
    .fill("Przykładowe twierdzenie z prywatnej sesji demonstracyjnej.");
  await second
    .getByLabel("Treść wiadomości")
    .fill("Drugi kanał tej samej prywatnej sesji demonstracyjnej.");
  // Session management is real; no paid analysis is needed to exercise deletion.
  const started = await context.request.post("/api/session", {
    headers: { "x-prawdowid-action": "start-session" },
  });
  expect(started.ok()).toBe(true);
  const before = await context.cookies();
  expect(before.some((c) => c.name === "prawdowid-session")).toBe(true);
  await page.getByRole("button", { name: "Usuń sesję i jej zapis" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Usunięto lokalny zapis",
  );
  await expect(page.getByLabel("Twierdzenie do sprawdzenia")).toHaveValue("");
  await expect(second.getByLabel("Treść wiadomości")).toHaveValue("");
  expect(
    (await context.cookies()).some((c) => c.name === "prawdowid-session"),
  ).toBe(false);
  expect(
    await (await context.request.get("/api/session")).json(),
  ).toMatchObject({ records: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("privacy-mobile.png"),
    fullPage: true,
  });
});

test("a failed deletion never displays a success message or clears the input", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 503, json: { message: "Storage unavailable" } })
      : route.continue(),
  );
  await page.goto("/");
  const input = page.getByLabel("Twierdzenie do sprawdzenia");
  await input.fill("To treść, która ma pozostać po nieudanym usunięciu.");
  await page.getByRole("button", { name: "Usuń sesję i jej zapis" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Nie udało się potwierdzić",
  );
  await expect(input).not.toHaveValue("");
});
