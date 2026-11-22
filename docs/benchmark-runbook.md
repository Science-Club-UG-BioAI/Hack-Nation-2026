# Ścieżka 1: jak uruchomić pomiary

Stan 22.11.2026: [bieżące wyniki i granice deklaracji](../README.md#aktualny-stan-pomiarów--22112026), [dane pomiarowe](../data/measurements/status-2026-11-22.json). Jedna próba online po optymalizacji nie stanowi pełnego benchmarku. Koszt 100 testów online pozostaje niezmierzony.

Bez opłat: `node scripts/load-test.mjs` (limiter) i `node scripts/load-test.mjs --benchmark` (100 analiz z podstawionym HTTP i sztucznymi licznikami). Powstaje nowy katalog wyników z hashami kodu; można użyć `MEASUREMENT_OUTPUT`. Te testy nie zaliczają jakości online ani kosztu rzeczywistych 100 analiz. Poniższe polecenia wymagają oddzielnego uruchomienia i używają płatnych API.

Polecenia wymagają `.env.local` z kluczami (`GEMINI_API_KEY`, `TAVILY_API_KEY`, opcjonalnie `EUVSDISINFO_API_KEY`) i uruchomionego serwera (`npm run dev` albo `npm run build && npm start`). Przebiegi są płatne. Każdy przebieg zapisuj do nowego katalogu: runner odmówi nadpisania istniejącego `results.json`.

## Warianty runnera

| Zmienna | Wartości | Domyślnie |
|---|---|---|
| `BENCHMARK_VARIANT` | `api-json` (dotychczasowy JSON) albo `web-graph` (jak WWW: sesja, SSE, `evidenceGraph: true`) | `api-json` |
| `BENCHMARK_DATASET` | ścieżka do zestawu | `data/benchmark/cases.json` |
| `BENCHMARK_OUTPUT` | katalog wyników | `reports/benchmark/latest` |
| `BENCHMARK_INTERVAL_MS` | przerwa między przypadkami | `10000` |

Wariant `web-graph` zapisuje dla każdego przypadku: `graph` (`graphStatus`, liczba węzłów i krawędzi, etapy SSE), `euvsdisinfoStatus`, `usage` (gdy serwer je zwraca), czas do wyniku SSE i zgodność z adapterem Discord. W `results.json` jest `configuration` (wariant, czy ustawiono klucz EUvsDisinfo, bez wartości klucza). Mierniki: `metrics.evidenceGraph`, `metrics.euvsdisinfo`, `metrics.usageRecorded`.

## Pełny pomiar WWW z grafem

```bash
BENCHMARK_VARIANT=web-graph BENCHMARK_OUTPUT=reports/benchmark/www-graph-public-v1 npm run benchmark
```

```bash
BENCHMARK_VARIANT=web-graph BENCHMARK_DATASET=data/benchmark/regression-cases.json BENCHMARK_OUTPUT=reports/benchmark/www-graph-regression-v1 npm run benchmark
```

```bash
npm run benchmark:evaluate -- reports/benchmark/www-graph-public-v1
```

Wyniki zestawów `public-v1` i `regression-v1` raportujemy osobno. Nie łączymy ich w jeden wynik.

## S02 i pozostałe kontrolowane źródła

```bash
RUN_BENCHMARK_CONTROLLED=1 BENCHMARK_CONTROLLED_OUTPUT=reports/benchmark/controlled-s02-fix node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/benchmark-controlled-live.test.ts
```

Oczekiwane: S01 i S02 `insufficient` z `evidenceConflict: true`, S03 `supported`, S04 `refuted`, zdarzenia filtrowania przy S03 i S04.

## Ocena cytatów

Metoda: [citation-review.md](citation-review.md). Formularz powstaje przy `benchmark:evaluate`. Wypełniony plik zapisujemy jako `citation-review.json` obok `results.json`.
