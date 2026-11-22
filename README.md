# KitCheck (Prawdowid)

KitCheck sprawdza jedną tezę na podstawie publicznych źródeł. Raport pokazuje ocenę, cytaty z linkami, ograniczenia i interaktywny graf dowodowy. Formularz przyjmuje do 500 znaków. Można też dołączyć obraz JPG, PNG lub WebP do 4 MiB, aby odczytać z niego kontekst lub propozycję tezy.

## Uruchomienie lokalne

Wymagania: Node.js 22.13+ i npm.

```bash
npm ci
cp -n .env.example .env.local
# Ustaw klucze w .env.local przed uruchomieniem.
npm run dev
```

Uzupełnij `GEMINI_API_KEY` i `TAVILY_API_KEY` w `.env.local`, a następnie otwórz http://127.0.0.1:3000. Opcjonalne klucze do Google Fact Check, Serper i EUvsDisinfo są opisane w [.env.example](.env.example). Plik z kluczami trzymaj poza repozytorium.

## Wdrożenie z Dockerem

Na serwerze z Docker Engine, Docker Compose v2 i Make przygotuj `.env.local` jak wyżej.

| Polecenie     | Działanie                                                                    |
| ------------- | ---------------------------------------------------------------------------- |
| `make build`  | Buduje obraz produkcyjny.                                                    |
| `make up`     | Uruchamia kontener i czeka na kontrolę zdrowia.                              |
| `make stop`   | Zatrzymuje kontener.                                                         |
| `make remove` | Usuwa kontener i sieć Compose. Obraz i wolumen SQLite pozostają na serwerze. |

Jeśli Docker wymaga uprawnień administratora, uruchamiaj polecenia przez `sudo make`. Aplikacja domyślnie jest dostępna na `127.0.0.1:3000`. Przy publicznym wdrożeniu ustaw reverse proxy HTTPS z zachowaniem `Host`, nagłówkiem `X-Forwarded-Proto: https` i wyłączonym buforowaniem odpowiedzi strumieniowych. Port hosta można zmienić przez `make up KITCHECK_PORT=8080`.

## Jak działa analiza

Tavily pobiera kontekst do wyszukiwania. Właściwa ocena dotyczy tezy wejściowej i korzysta z materiałów z dozwolonych domen, [korpusu](data/corpus/catalog.json) i skonfigurowanych dostawców. Backend sprawdza dosłowność cytatów, a dodatkowy audyt sprawdza, czy uzasadniają ustalenia. Graf przedstawia opublikowaną ocenę i jej źródła. Jeśli brakuje podstaw do rozstrzygnięcia lub analiza się nie powiedzie, aplikacja komunikuje to w wyniku.

Aplikacja maskuje rozpoznane dane osobowe przed wysłaniem treści do dostawców. Szczegóły przetwarzania i retencji opisuje [polityka prywatności](docs/privacy-providers.md).

## API

- `POST /api/verify` przyjmuje `{"claim":"…","statedAt":"2026-11-21","evidenceGraph":true}`. Data i flaga grafu są opcjonalne. Gdy daty brakuje, przyjmowany jest dzisiejszy dzień w strefie Europe/Warsaw.
- `GET /api/health` sprawdza dostępność aplikacji i gotowość konfiguracji.
- `GET /api/corpus` zwraca katalog źródeł, dostępny też pod `/zrodla`.
- `GET /api/demo?id=synthetic-graph` zwraca oznaczony przykład bez wywołań dostawców. Symulator kanału Discord jest dostępny pod `/kanal-demo`.

## Testy i pomiary

```bash
npm test
npm run typecheck
npm run format:check
npm run corpus:check
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

Sposób odtwarzania pomiarów opisuje [instrukcja benchmarku](docs/benchmark-runbook.md). [Migawka pomiarów](data/measurements/status-2026-11-22.json) dotyczy wersji zapisanej w jej metadanych.
