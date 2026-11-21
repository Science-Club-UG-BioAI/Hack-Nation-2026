# Ścieżka 2 — Silnik, dane źródeł i koszt

Właściciel: ______. Zakres planu: P1.1 (backend), P1.2, P1.3 (prywatność w kodzie), P1.4. Gałęzie: `s2/<opis>`.

Cel: tokeny i koszt w wyniku, raport kosztu i obciążenia, metadane aktualności i wydawcy, szersze maskowanie, powiadomienie odbiorcy.

## Własność plików

Tylko ta ścieżka edytuje:

- `src/core/contracts.ts` (wyłącznie pola z kontraktu w indeksie)
- `src/core/evidence.ts`, `src/core/privacy.ts`
- `src/server/gemini-transport.ts`, `providers.ts`, `config.ts`, `limits.ts`, `corpus.ts`, `retrieval.ts`, `source-adapters.ts`, `audit-store.ts`, `handle-verification.ts`, `verification-service.ts`
- nowe: `src/server/alerts.ts`, `tests/alerts.test.ts`, `scripts/load-test.mjs`
- `data/corpus/**`, `scripts/check-corpus.mjs`
- testy: `privacy`, `limits`, `providers`, `gemini-transport`, `corpus`, `evidence`, `retrieval`, `api`, `channels`; `e2e/privacy.spec.ts`
- raporty: `reports/cost/**`, `reports/load/**`

## Zadania

0. **Kontrakt typów (pierwszy PR, przed resztą).** Dodać do `contracts.ts` pola z sekcji „Kontrakt” w indeksie. Wszystkie opcjonalne, bez logiki. Scalić jak najszybciej; pozostałe ścieżki tylko czytają te typy.
1. **Tokeny i koszt.** Zapis użycia na każde wywołanie modelu i wyszukiwania, agregat w `result.usage`, kolumna w SQLite, cennik w `config.ts`. Brak danych = `null`, nigdy zero.
   - Odbiór: testy z podmienionym HTTP pokazują `usage` w wyniku i w bazie.
2. **Raport kosztu.** Koszt 100 testów zmierzony własnym przebiegiem obecnego runnera (`scripts/benchmark.mjs`, wariant domyślny). Koszt trafienia w cache i nowej analizy. Szacunek 1000 zapytań przy jawnych założeniach. Adapter demo bez opłaty komunikatora, analiza nie jest bezkosztowa.
   - Odbiór: `reports/cost/` i tekst do pakietu zgłoszeniowego. Jeśli ścieżka 1 dostarczy pomiar z grafem, dopisać jego koszt jako drugą pozycję.
3. **Obciążenie.** `scripts/load-test.mjs` na podmienionym HTTP: 429, mediana/p95, odsetek błędów, liczba wywołań dostawcy. Osobno opis realnych limitów usług. Bez obietnicy 1000 równoczesnych użytkowników.
   - Odbiór: `reports/load/` z liczbami.
4. **Aktualność i wydawca.** Daty publikacji, aktualizacji i okresu zdarzenia w katalogu i wynikach; jawny brak daty (nie data pobrania); ostrzeżenie archiwalności; rzeczywisty wydawca, domena oznaczona jako zastępcza; opis siły podstawy w `result.strength` z ograniczeniem grupowania (gov.pl = jedna grupa).
   - Odbiór: testy pól i ostrzeżeń; `npm run corpus:check` przechodzi.
5. **Maskowanie.** Numer dowodu, zagraniczne IBAN; testy fałszywie dodatnich i niszczenia kontekstu tezy.
   - Odbiór: testy nowych wzorców przechodzą.
6. **Powiadomienie odbiorcy.** `alerts.ts`: reguła wysokiego ryzyka i powtórzeń bez źródeł, odbiorca (webhook) z konfiguracji administratora, minimalna treść, zapis wyniku dostarczenia. Jedno wywołanie w `handle-verification.ts`.
   - Odbiór: testy wyzwolenia, braku wyzwolenia, awarii dostarczenia; awaria nie zmienia werdyktu.

Zadania 1–6 nie zależą od innych ścieżek.

## Przekazuje innym ścieżkom

- Wszystkim: scalony kontrakt typów (zadanie 0).
- Ścieżce 3: raport kosztu i obciążenia, opis działania alertu i nowych wzorców maskowania (fakty do dokumentacji).
