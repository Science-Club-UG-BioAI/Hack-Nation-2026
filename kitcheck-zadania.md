# KITCHECK — trzy niezależne ścieżki

Źródło: [kitcheck-plan.md](kitcheck-plan.md), stan 21.11.2026. Prace podzielone na trzy ścieżki z rozłączną własnością plików. Każda ścieżka ma własny backlog, gałęzie i odbiór.

| Ścieżka | Plik | Zakres planu | Właściciel |
|---|---|---|---|
| 1. Pomiar i jakość | [kitcheck-sciezka-1-pomiar.md](kitcheck-sciezka-1-pomiar.md) | P0.2, P0.3, P0.4 (injection) | ______ |
| 2. Silnik, dane źródeł i koszt | [kitcheck-sciezka-2-silnik.md](kitcheck-sciezka-2-silnik.md) | P1.1 backend, P1.2, P1.3 kod, P1.4 | ______ |
| 3. Interfejs, dokumentacja, zgłoszenie | [kitcheck-sciezka-3-ui-zgloszenie.md](kitcheck-sciezka-3-ui-zgloszenie.md) | P1.1 UI, P1.3 docs i dostępność, P1.5, próba jury | ______ |

## Zasady

- Ścieżka edytuje tylko pliki ze swojej listy „Własność plików”. Plik spoza listy = rozmowa z właścicielem, nie samodzielna zmiana.
- Gałęzie: `s1/…`, `s2/…`, `s3/…`. Małe PR do `main`, rebase przed scaleniem.
- Każdy PR: typecheck, testy jednostkowe, testy przeglądarkowe, `npm run corpus:check`.
- Między ścieżkami przekazujemy dane (raporty, liczby), nie kod. Brak danych nie blokuje pracy: wstawiamy miejsce do uzupełnienia.
- `reports/` jest ignorowany przez git. Historyczne raporty: `git show 719daaa:reports/benchmark/p02-report.md`.

## Kontrakt typów

Jedyny punkt styku w kodzie. Ścieżka 2 dodaje te pola do `src/core/contracts.ts` w pierwszym PR. Wszystkie opcjonalne, bez logiki. Ścieżka 1 zapisuje je w benchmarku, ścieżka 3 je wyświetla. Zmiana kształtu wymaga zgody wszystkich trzech właścicieli.

```ts
export type SourceMetadata = {
  // istniejące pola bez zmian
  publisher?: string | null;
  publisherIsDomain?: boolean;
  updatedAt?: string | null;
  eventPeriod?: { from: string | null; to: string | null } | null;
  freshnessWarning?: string | null;
};

type ResultBase = {
  // istniejące pola bez zmian
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    searchCalls: number;
    costUsd: number | null;
    cached: boolean;
  };
  strength?: {
    summary: string;
    independentGroups: number;
    limitations: string[];
  };
};
```

Do czasu scalenia kontraktu ścieżki 1 i 3 traktują te pola jako nieobecne (`undefined`).

## Jedyny punkt synchronizacji: zamrożenie kodu

Termin: ______. Po nim na `main` wchodzą tylko poprawki błędów.

- Ścieżka 1 wykonuje pełny pomiar i ocenę cytatów na zamrożonym `main`.
- Ścieżka 3 robi próbę jury z czystej kopii i wstawia liczby do opisu, slajdów i filmu.
- Ścieżka 2 dopisuje koszt pomiaru z grafem, jeśli ścieżka 1 dostarczy `results.json` z `usage`.

Czego nie zdążono scalić przed zamrożeniem, nie wchodzi do zgłoszenia i trafia do listy ryzyk.

## Poza zakresem MVP

Pozycje P2 z planu (URL, Google Fact Check, OCR, pętla moderatora, kolejka, Docker, wielojęzyczność) nie wchodzą do ścieżek.
