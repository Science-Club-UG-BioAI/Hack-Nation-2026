# Ścieżka 3 — Interfejs, dokumentacja i zgłoszenie

Właściciel: ______. Zakres planu: P1.1 (UI), P1.3 (dostępność, dokumentacja dostawców), P1.5, P0.4 (próba jury). Gałęzie: `s3/<opis>`.

Cel: UI pokazujący aktualność i siłę dowodów, dostępność, komplet materiałów zgłoszeniowych, próba jury z czystej kopii.

## Własność plików

Tylko ta ścieżka edytuje:

- `src/components/**`, `src/app/**` (strony i style; bez `src/app/api/**`)
- `e2e/dashboard.spec.ts`, `e2e/workbench.spec.ts`, `e2e/evidence-graph.spec.ts`, `e2e/channel.spec.ts`, `e2e/corpus.spec.ts`
- `README.md`
- nowe: `docs/submission/**`, `docs/privacy-providers.md`, `docs/sources-policy.md`
- `.gitignore` (tylko wyniki przeglądu sekretów)

## Zadania

1. **UI aktualności i siły.** W `verification-view.tsx` pokazać pola z kontraktu: datę publikacji albo „brak daty”, wydawcę (z oznaczeniem, gdy to domena), ostrzeżenie archiwalności, opis siły podstawy. Brak pola w wyniku = element ukryty lub „brak danych”. Do czasu danych ze ścieżki 2 testować na podstawionym wyniku w e2e.
   - Odbiór: test przeglądarkowy z wynikiem zawierającym pola i bez nich.

Zadania 1–6 można robić od razu. Zadanie 7 wymaga tylko zamrożenia kodu.

## Pobiera od innych ścieżek (dane, nie kod)

- Od ścieżki 1: `summary.json`, wynik oceny cytatów.
- Od ścieżki 2: raport kosztu i obciążenia, opis alertu i maskowania.

Brak tych danych nie blokuje pracy: zostają oznaczone miejsca do uzupełnienia.
