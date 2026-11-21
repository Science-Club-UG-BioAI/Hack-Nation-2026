import { expect, test } from "@playwright/test";

const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64",
);
const suggestedClaim = "Na plakacie podano, że targ działa w soboty.";

const description = "Na plakacie widnieje napis o targu.";
const image = { name: "plakat.png", mimeType: "image/png", buffer: bytes };

for (const existing of [true, false]) {
  test(
    "automatically attaches context " +
      (existing
        ? "to a claim typed during reading"
        : "and fills an empty claim"),
    async ({ page }) => {
      const original = "Poprzednia teza wpisana do formularza.";
      let complete!: () => void;
      const ready = new Promise<void>((resolve) => {
        complete = resolve;
      });
      let verified: unknown;
      await page.route("**/api/vision", async (route) => {
        expect(route.request().postDataBuffer()).toEqual(bytes);
        await ready;
        await route.fulfill({ json: { description, suggestedClaim } });
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
      const submit = page.getByRole("button", { name: "Sprawdź dowody" });
      const fileInput = page.getByLabel("Dołącz obraz");
      await expect(fileInput).toBeEnabled();
      const reading = page.waitForRequest("**/api/vision");
      await fileInput.setInputFiles(image);
      await reading;
      if (existing) await claim.fill(original);
      await expect(submit).toBeDisabled();
      complete();
      await expect(
        page.getByText("Kontekst obrazu dołączony do tezy."),
      ).toBeVisible();
      await expect(claim).toHaveValue(existing ? original : suggestedClaim);
      await page.getByText("Pokaż opis obrazu").click();
      await expect(page.getByText(description)).toBeVisible();
      expect(verified).toBeUndefined();
      const edited = "Targ przy ulicy Leśnej jest czynny w soboty.";
      await claim.fill(edited);
      await submit.click();
      await expect
        .poll(() => verified)
        .toEqual({
          claim: edited,
          imageContext: description,
          evidenceGraph: true,
        });
    },
  );
}

test("clears a replaced image's suggestion and allows retry or removal after an error", async ({
  page,
}) => {
  let uploads = 0;
  await page.route("**/api/vision", (route) => {
    uploads++;
    if (uploads === 2)
      return route.fulfill({
        status: 502,
        json: {
          code: "ERROR",
          requestId: "",
          retryable: true,
          message: "Błąd odczytu.",
        },
      });
    return route.fulfill({
      json: {
        description:
          uploads === 1 ? description : "Grafika zawiera żartobliwy podpis.",
        suggestedClaim: uploads === 1 ? suggestedClaim : null,
      },
    });
  });
  await page.goto("/");
  const claim = page.getByLabel("Twierdzenie do sprawdzenia");
  const input = page.getByLabel("Dołącz obraz");
  const submit = page.getByRole("button", { name: "Sprawdź dowody" });
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: "plik.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("tekst"),
  });
  await expect(page.locator(".image-input").getByRole("alert")).toContainText(
    "JPG",
  );
  expect(uploads).toBe(0);
  await input.setInputFiles(image);
  await expect(claim).toHaveValue(suggestedClaim);
  await input.setInputFiles({ ...image, name: "inny.png" });
  await expect(page.getByText("Błąd odczytu.")).toBeVisible();
  await expect(claim).toHaveValue("");
  await page.getByRole("button", { name: "Ponów odczyt" }).click();
  await expect(
    page.getByText(/Wpisz tezę, którą chcesz sprawdzić/),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  const manual = "To jest samodzielnie wpisana teza.";
  await claim.fill(manual);
  await page.getByRole("button", { name: "Usuń obraz" }).click();
  await expect(claim).toHaveValue(manual);
  await expect(submit).toBeEnabled();
  await expect(page.getByText("Pokaż opis obrazu")).toHaveCount(0);
});
