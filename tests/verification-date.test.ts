import { expect, it } from "vitest";
import { relativeDayReferences } from "@/core/verification-date";

it("resolves a relative day across the year boundary from the statement date", () => {
  expect(
    relativeDayReferences("Dwa dni temu odbyło się spotkanie.", "2027-01-01"),
  ).toBe("„dwa dni temu” oznacza 30 grudnia 2026.");
});

it.each(["dwadzieścia dwa dni temu", "1–2 dni temu"])(
  "does not publish the last number in %s as an exact relative date",
  (phrase) => expect(relativeDayReferences(phrase, "2026-11-21")).toBe(""),
);
