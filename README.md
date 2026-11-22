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

## Bot Discord bez serwera

Bot działa jako aplikacja dodawana do konta użytkownika (**User Install**). Mentor otwiera link instalacyjny, wybiera dodanie do swojego konta, a następnie używa `/sprawdz` w prywatnej rozmowie (DM lub grupowej DM). Nie trzeba tworzyć wspólnego serwera Discord ani znać wcześniej identyfikatorów mentorów. Komendy są dostępne także w DM z aplikacją, jeśli taki czat jest dostępny w kliencie. Odpowiedzi są prywatne (ephemeral), widoczne tylko dla osoby wywołującej komendę.

Transport wykorzystuje `discord.js` i wychodzące połączenie Gateway. Do lokalnego testu wystarczy działający komputer z Node.js i dostępem do internetu. Nie potrzeba publicznego HTTPS, tunelu ani Interactions Endpoint URL. Bot jest osobnym procesem i nie wymaga uruchomienia strony WWW. [Gateway](https://docs.discord.com/developers/events/gateway) · [User Install](https://github.com/discord/discord-api-docs/blob/main/developers/tutorials/developing-a-user-installable-app.mdx)

### Konfiguracja aplikacji

1. Otwórz [Discord Developer Portal](https://discord.com/developers/applications), wybierz **New Application**, nadaj nazwę, np. „Prawdowid”.
2. W **General Information** skopiuj **Application ID** do `DISCORD_APPLICATION_ID` w `.env.local`. Pole **Interactions Endpoint URL** pozostaw puste, aby interakcje trafiały przez Gateway.
3. W **Installation → Installation Contexts** włącz **User Install**. Ten wariant nie wymaga **Guild Install**. Wybierz **Discord Provided Link**, a w ustawieniach instalacji użytkownika zakres **applications.commands**.
4. W **Bot** utwórz lub zresetuj token i zapisz go jako `DISCORD_BOT_TOKEN` w `.env.local`. Nie włączaj uprzywilejowanych intents, w tym Message Content Intent. Token pozostaje wyłącznie na komputerze uruchamiającym bota.
5. Ustaw `DISCORD_SESSION_KEY` na losowy sekret o długości 64 znaków szesnastkowych. Można wygenerować go poleceniem `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Zachowaj także istniejące klucze `GEMINI_API_KEY` i `TAVILY_API_KEY`.
6. W katalogu projektu wykonaj poniższe polecenia. Rejestracja tworzy lub aktualizuje wyłącznie globalne komendy `/sprawdz` i `/pomoc`, zachowując inne komendy aplikacji. Po zmianie definicji komend uruchom ją ponownie.

```powershell
npm ci
npm run discord:check
npm run discord:register
npm run discord:start
```

`discord:check` sprawdza lokalną kompletność konfiguracji bez połączenia z Discordem. `discord:register` wypisuje link instalacyjny, który można udostępnić mentorom. `discord:start` pozostaje uruchomiony podczas testów, zakończysz go przez Ctrl+C. Do nieprzerwanego działania potrzebny jest stale uruchomiony proces Node.js. Istniejący obraz Docker uruchamia aplikację WWW; proces bota uruchamiaj osobno z checkoutu i jego zależności.

### Użycie i sprawdzenie działania

Po instalacji otwórz istniejący prywatny czat ze znajomym, wpisz `/sprawdz` i wybierz komendę Prawdowidu z listy aplikacji. Jeśli nie pojawia się od razu, odśwież klienta Discord i sprawdź, czy aplikacja została dodana do właściwego konta oraz czy rejestracja zakończyła się powodzeniem.

```text
/sprawdz teza:Polska przystąpiła do NATO 12 marca 1999 roku.
/sprawdz teza:Polska przystąpiła do Unii Europejskiej w 1999 roku. data:2026-11-21
/pomoc
```

Parametr `data` oznacza datę odniesienia dla tezy. Domyślnie silnik używa bieżącej daty w Warszawie. Obsługujemy pojedynczy tekst do 500 znaków; sam URL wymaga wklejenia treści tezy. Najpierw bot potwierdza odbiór, następnie przesyła wynik silnika, cytaty, źródła i ograniczenia. Wynik nie jest ustalony z góry dla powyższych przykładów. Brak podstaw lub błąd usługi jest jawnie komunikowany.

Odpowiedź jest dzielona na wiadomości mieszczące się w limicie Discorda. Dla wyniku wymagającego więcej niż pierwsza wiadomość i pięć kontynuacji bot dołącza cały wynik w pliku tekstowym, zachowując źródła. Wzmianki typu `@everyone` nie wywołują powiadomień. [Potwierdzanie i odpowiedzi](https://discordjs.guide/legacy/slash-commands/response-methods) · [Limit kontynuacji dla User Install](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx)

### Silnik, dane i ograniczenia

Bot wywołuje `executeVerification` → `runVerification` → `verify`. WWW oraz symulator korzystają z tego samego przebiegu przez `handleVerification`. Zachowane są walidacja, limit czasu, maskowanie rozpoznanych danych osobowych, limity użycia, liczniki kosztów oraz audyt. Audyt oznacza rzeczywisty kanał jako `discord`. Powtórne dostarczenie tej samej interakcji jest ignorowane w pamięci procesu przez 15 minut; rejestr ma limit 1000 identyfikatorów.

Sesja Discord jest wyliczana przez HMAC z identyfikatora aplikacji i użytkownika. Nie współdzieli sesji z przeglądarką. Limity i cache są lokalne dla procesu, więc uruchomienie WWW i bota oznacza dwa oddzielne budżety `MAX_LIVE_VERIFICATIONS`. Uruchamiaj jedną instancję bota. Audyt ma istniejącą retencję do 24 godzin, cache wyników do godziny; retencja Discorda jest odrębna. Token bota i tokeny interakcji nie są zapisywane w audycie ani logach błędów. Restart podczas analizy może przerwać odpowiedź; użytkownik powinien wtedy wywołać komendę ponownie.

Automatyczne testy `tests/discord-bot.test.ts` obejmują transport na kontrolowanych interakcjach, a `tests/channels.test.ts` uruchamia również pełny silnik dla prywatnej komendy z kontrolowanymi odpowiedziami dostawców. Test na rzeczywistym koncie Discord wymaga konfiguracji tokenu, instalacji i wysłania komendy przez użytkownika. Samo zaliczenie testów lokalnych nie potwierdza dostarczenia przez Discord.

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
