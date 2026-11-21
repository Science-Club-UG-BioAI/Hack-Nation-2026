# Ścieżka 1 — Pomiar i jakość odpowiedzi

Właściciel: ______. Zakres planu: P0.2, P0.3, P0.4 (injection). Gałęzie: `s1/<opis>`.

Cel: aktualny, odtwarzalny pomiar ścieżki WWW z grafem, poprawione S02, niezależna ocena cytatów ≥85% i testy ataków.

## Własność plików

Tylko ta ścieżka edytuje:

- `scripts/benchmark.mjs`, `scripts/benchmark-report.mjs`, `scripts/evaluate-run.mjs`, `scripts/compare-benchmarks.mjs`
- `data/benchmark/**`
- `src/core/benchmark.ts`, `src/core/untrusted.ts`
- `src/server/verify.ts`
- `tests/benchmark*.test.ts`, `tests/hardening.test.ts`, `tests/abstention.test.ts`, `tests/pipeline.test.ts`
- `e2e/hardening.spec.ts`
- nowe: `docs/citation-review.md`, `scripts/review-citations.mjs`
- raporty: `reports/benchmark/**`

## Zadania

1. **Runner WWW z grafem.** Przełącznik CLI wysyła `evidenceGraph: true`. Zapis `graphStatus`, czasu odpowiedzi, zgodności wspólnego wyniku z adapterem Discord i flagi wyboru EUvsDisinfo (bez klucza). Jeśli wynik ma pole `usage` z kontraktu, runner je zapisuje; brak pola = `null`. Domyślny wariant bez zmian.
   - Odbiór: suchy przebieg na podmienionym HTTP zapisuje nowe pola.
2. **S02.** Powtórzyć na kontrolowanych źródłach, ustalić przyczynę odrzucenia przez audyt, poprawić w `verify.ts`. Bez hardkodowania odpowiedzi.
   - Odbiór: S02 = `insufficient` z jawną sprzecznością; S01, S03, S04 bez regresji.
3. **Nowe przypadki regresyjne.** Zachować ≥30 przypadków i jawne etykiety. Dodać przypadki niezależne od przykładów użytych do strojenia promptów.
   - Odbiór: nowy hash zestawu, walidacja przechodzi.
4. **Testy injection.** Nowe ataki na wejściu i w źródłach; sprawdzić zachowanie i zapis zdarzeń; poprawki w `untrusted.ts`.
   - Odbiór: testy przechodzą; raport jako mała próba, nie gwarancja ≥90%.
5. **Metoda oceny cytatów.** Rubryka: adekwatność, atomowość, podział fakt/opinia. Formularz powiązany z hashem przebiegu. Recenzent inny niż model użyty w audycie. Próba na `p02-run4` (`git show 719daaa:reports/benchmark/...`).
   - Odbiór: formularz i próbna ocena z hashem.
6. **Pełny pomiar.** Na `main` po zamrożeniu kodu (patrz indeks). Zapisać wersję kodu, konfigurację źródeł, hash zestawu, wszystkie przebiegi, także niepełne, z przyczynami przerwania.
   - Odbiór: macro-F1, pokrycie, wstrzymanie, mediana/p95 z grafem, `graphStatus`, spójność kanałów; niespełnione progi wskazane wprost.
7. **Niezależna ocena cytatów** na przebiegu z zadania 6, metodą z zadania 5.
   - Odbiór: wypełniony formularz z hashem, recenzent, metoda; wynik ≥85% albo jawny brak progu.

Zadania 1–5 można robić od razu. Zadania 6–7 wymagają tylko zamrożenia kodu, nie pracy innych ścieżek: jeśli ścieżka 2 nie zdąży, pomiar idzie bez jej zmian i raport to odnotowuje.

## Przekazuje innym ścieżkom (dane, nie kod)

- Ścieżce 2: surowe `results.json` z zadania 6 (do raportu kosztu, jeśli zawiera `usage`).
- Ścieżce 3: `summary.json` i wynik oceny cytatów do opisu, slajdów i filmu.
