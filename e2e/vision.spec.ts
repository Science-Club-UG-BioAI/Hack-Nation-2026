import { expect, test } from "@playwright/test";

test("reviews the image reading before sending an editable text claim for verification", async ({
  page,
}) => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
    "base64",
  );
  const suggestedClaim = "Na plakacie podano, że targ działa w soboty.";
  const original = "Poprzednia teza wpisana do formularza.";
  let uploads = 0;
  let verified: unknown;
  await page.route("**/api/vision", async (route) => {
    uploads++;
    expect(route.request().postDataBuffer()).toEqual(bytes);
    expect(route.request().headers()["content-type"]).toBe("image/png");
    await route.fulfill({
      json: {
        description: "Na plakacie widnieje napis o targu.",
        suggestedClaim,
      },
    });
  });
  await page.route("**/api/verify", async (route) => {
    verified = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      json: {
        code: "NOT_CONFIGURED",
        retryable: false,
        requestId: "",
        message: "Test offline.",
      },
    });
  });
  await page.goto("/");
  const claim = page.getByLabel("Twierdzenie do sprawdzenia");
  await claim.fill(original);
  await page.getByText("Dodaj obraz", { exact: true }).click();
  const input = page.getByLabel("Wybierz obraz");
  await input.setInputFiles({
    name: "plik.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("tekst"),
  });
  await expect(page.locator(".image-input").getByRole("alert")).toContainText(
    "JPG",
  );
  await input.setInputFiles({
    name: "plakat.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await expect(page.getByAltText("Podgląd wybranego obrazu")).toBeVisible();
  expect(uploads).toBe(0);
  await page.getByRole("button", { name: "Opisz obraz" }).click();
  await expect(
    page.getByText("Na plakacie widnieje napis o targu."),
  ).toBeVisible();
  await expect(claim).toHaveValue(original);
  await page.getByRole("button", { name: "Wstaw tezę do formularza" }).click();
  await expect(claim).toHaveValue(suggestedClaim);
  expect(verified).toBeUndefined();
  const edited = "Targ przy ulicy Leśnej jest czynny w soboty.";
  await claim.fill(edited);
  await page.getByRole("button", { name: "Sprawdź dowody" }).click();
  await expect
    .poll(() => verified)
    .toEqual({ claim: edited, evidenceGraph: true });
});
