import { expect, it } from "vitest";
import { preservesContextDates } from "@/server/context-dates";

it("rejects an invented event date and accepts the date stated in the web context", () => {
  const claim = "W Polsce spadły dwie rakiety i dron.";
  const context = ["Trzy obiekty spadły w Polsce 20.11.2026."];
  expect(
    preservesContextDates(
      claim,
      "Obiekty spadły 22 listopada 2026 roku.",
      context,
      "",
    ),
  ).toBe(false);
  expect(
    preservesContextDates(
      claim,
      "Obiekty spadły 20 listopada 2026 roku.",
      context,
      "",
    ),
  ).toBe(true);
});

it("preserves an explicit claim date even when the search describes a different day", () => {
  expect(
    preservesContextDates(
      "Obiekty spadły 2026-11-21.",
      "Obiekty spadły 2026-11-20.",
      ["Obiekty spadły 20 listopada 2026 r."],
      "",
    ),
  ).toBe(false);
});

it("allows a relative date resolved by the server", () => {
  expect(
    preservesContextDates(
      "Obiekty spadły przedwczoraj.",
      "Obiekty spadły 2026-11-20.",
      [],
      "„przedwczoraj” oznacza 20 listopada 2026.",
    ),
  ).toBe(true);
});
