import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SourceQuote } from "@/components/source-quote";

function render(text: string) {
  return renderToStaticMarkup(
    createElement(SourceQuote, {
      text,
      sourceUrl: "https://example.org/reports/article",
    }),
  );
}

it("formats headings, emphasis, lists and tables from source Markdown", () => {
  const html = render(
    "### Wynik\n\n**Dwie rakiety** i _dron_.\n\n- Pierwszy obiekt\n- Drugi obiekt\n\n| Obiekt | Liczba |\n| --- | --- |\n| Rakiety | 2 |",
  );
  expect(html).toContain("<h3>Wynik</h3>");
  expect(html).toContain("<strong>Dwie rakiety</strong>");
  expect(html).toContain("<em>dron</em>");
  expect(html).toContain("<li>Pierwszy obiekt</li>");
  expect(html).toContain("<table>");
  expect(html).toContain("<td>2</td>");
});

it("links to HTTP(S) sources and displays image descriptions without remote images", () => {
  const html = render(
    "[Raport](../raport) [Zły adres](javascript:alert%281%29)\n\n![Mapa](https://example.org/tracker.png)\n\n<img src=x onerror=alert(1)>",
  );
  expect(html).toContain('href="https://example.org/raport"');
  expect(html).toContain("Zły adres");
  expect(html).toContain("Mapa");
  expect(html).not.toMatch(/javascript:|<img|onerror|tracker\.png/);
});
