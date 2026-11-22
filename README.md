# Prawdowid

**Aktualizacja: pomiary z 22.11.2026.** Bieżący stan i ograniczenia opisuje tabela poniżej. Sekcje etapów 2, 3, P0.1 i P0.2 zachowują historię prac; ich wyniki nie stanowią walidacji aktualnego kodu.

Prototyp HackNation 2026: **teza → wyszukiwanie → ocena → kontrola cytatów → wynik z dowodami**.
Ta wersja przyjmuje jedną niepustą tezę (do 500 znaków), nie cały artykuł. Obsługuje WWW i działający adapter demonstracyjny wiadomości Discord, zgodnie z pierwszym etapem dostosowania do opisu wyzwania.

W panelu WWW można dołączyć JPG, PNG lub WebP do 4 MiB. Po wyborze pliku Gemini automatycznie przygotowuje opis, który staje się kontekstem tezy. Jeśli pole tezy jest puste, pojawi się w nim propozycja z obrazu, o ile grafika zawiera sprawdzalne twierdzenie. Tezę można edytować przed wybraniem **Sprawdź dowody**. Odczyt obrazu wymaga klucza Gemini i zużywa jedną próbę ze wspólnego limitu analiz.

## Aktualny stan pomiarów — 22.11.2026

Dane do ponownego przeliczenia: [migawka pomiarów](data/measurements/status-2026-11-22.json). Zawiera liczniki wywołań ostatniej analizy, wyniki kontrolowanych testów, hashe plików źródłowych oraz liczebności prób. Migawka zachowuje stan sprzed dodania trzech artykułów Demagoga; jej 129 rekordów i hash katalogu dotyczą tamtej wersji. Bieżący korpus opisują [aktualny katalog](data/corpus/catalog.json) i wynik `npm run corpus:check`. Pełne odpowiedzi analiz online i pełne historyczne benchmarki pozostają lokalnie w ignorowanym katalogu `reports/`; wybrane starsze raporty kosztu/obciążenia są już śledzone w Git. Migawka nie zawiera kluczy, cookies ani pełnych artykułów. Nie jest pełnym archiwum pozwalającym niezależnie powtórzyć ocenę wszystkich historycznych cytatów.

| Obszar                                              | Aktualny dowód                                                                                                                  | Co można stwierdzić                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Analiza online po optymalizacji                     | 1 nowa sesja, API JSON, bez grafu; Polska w NATO od 12.03.1999; `completed/supported`, 16,914 s                                 | Jedna udana próba, nie pełny benchmark ani miarodajna mediana                                                                      |
| Koszt tej analizy                                   | Tavily: 3 wywołania / 5 kredytów / 0,040 USD; Gemini: 3 wywołania, 22 456 tokenów wejścia i 2653 wyjścia / 0,0095935 USD        | Znane składniki: **0,0495935 USD**; 2 wywołania Google Fact Check mają nieustaloną cenę, więc pełny koszt to `null`                |
| Scenariusz 100 / 1000 takich analiz                 | 4,95935 / 49,5935 USD za Gemini + Tavily                                                                                        | Ekstrapolacja jednej obserwacji, nie zmierzony koszt 100/1000 testów; bez hostingu, obrazów i nieznanych opłat                     |
| Korpus                                              | 132 rekordy, 14 grup domen, **2 typy: official (129) i fact_check (3)**; 6 dat publikacji, 4 aktualizacji, 2 okresy zdarzeń      | Progi ≥100 rekordów, ≥10 grup domen i ≥2 typów spełnione; 3 artykuły Demagoga sprawdzono przez rzeczywiste pobranie HTML         |
| Poprawność cytatów                                  | Historyczny `p02-run4`: **66/121 = 54,5%**, pełna ocena przez GPT-6, inny model niż generator Gemini                            | Próg ≥85% niespełniony w tej ocenie; nie jest to ocena człowieka ani pomiar po optymalizacji                                       |
| Bieżąca jakość online                               | Brak pełnego nowego zestawu po zmianie wyszukiwania                                                                             | Macro-F1, pokrycie, wstrzymanie, odporność, mediana i spójność kanałów aktualnej wersji pozostają niepotwierdzone                  |
| Kontrola implementacji                              | **340 testów jednostkowych/integracyjnych**, 9 pominiętych; osobno **3 testy pobierania Demagoga**; **29 testów przeglądarkowych**, 4 live pominięte | Testy, kontrola typów i build po uzupełnieniu katalogu; testy pobierania nie wywołują płatnych usług i nie mierzą jakości werdyktów |
| Kontrolowany pomiar 100 analiz + 100 odczytów cache | 300 symulowanych wywołań Gemini i 300 Tavily; zadane 7100/750 tokenów i 5 kredytów na analizę                                   | Wycena symulowanego zużycia **4,29 USD**, faktyczne opłaty API **0 USD**; nie zalicza wymogu pomiaru 100 analiz online             |
| Powiadomienia                                       | Kod i testy istnieją; lokalnie `ALERT_WEBHOOK_URL` nie jest ustawiony                                                           | Brak potwierdzonego dostarczenia do rzeczywistego odbiorcy                                                                         |

**Historycznych wyników nie przenosimy na bieżący kod.** W `p02-run4` uzyskano 30/30, macro-F1 1,000 i pokrycie przypisań 44/44. Nie oznacza to poprawności znaczeniowej cytatów ani zaliczenia aktualnej wersji. Trzy późniejsze próby sprzed optymalizacji dały 1/3 oczekiwanych wyników: potwierdzenie, odrzucenie audytu i `INVALID_MODEL_OUTPUT`; ich średni znany koszt 0,104616 USD nie jest średnią po optymalizacji. Tych prób i ostatniej pojedynczej analizy nie łączymy w jeden wskaźnik jakości lub kosztu.

Hashe kodu zapisano przed nowymi testami offline. Pojedyncza próba online zachowała żądanie, odpowiedź i liczniki audytu, ale nie zapisała hasha kodu w chwili wykonania; nie uzupełniamy tej informacji wstecz.

Nowy test obciążenia jest całkowicie lokalny, z symulowanym opóźnieniem dostawców 20 ms. Pięć fal po 12 żądań dało 15 odpowiedzi HTTP 200 i 45 odmów HTTP 429; mediana/p95 przyjętych żądań: **187,7/197,7 ms**. Cała próba obejmowała 80 żądań w wariantach 1, 3 i 12 równoległych klientów. Równolegle działał kontrolowany test kosztu. To obserwacja limitera na tym komputerze, nie czas analizy online ani gwarancja przepustowości usług.

Do zamknięcia pozostają: poprawność cytatów, pełna walidacja jakości aktualnego kodu i koszt 100 testów online, konfiguracja odbiorcy alertów oraz odłożony przegląd dostawców/licencji. Materiały zgłoszeniowe są gotowe według informacji zespołu; ich plików i limitów formalnych nie weryfikowano ponownie.

## Uruchomienie

Wymagany Node.js 22.13+ (testowano na 24) oraz npm. Skrypty benchmarku używają wbudowanego usuwania typów TypeScript.

```powershell
npm ci
Copy-Item .env.example .env.local
# Uzupełnij GEMINI_API_KEY i TAVILY_API_KEY lokalnie.
npm run dev
```

Otwórz http://127.0.0.1:3000. Nie nadpisuj istniejącego `.env.local`. Po dodaniu lub zmianie kluczy uruchom serwer ponownie. Sekrety są używane wyłącznie na serwerze. Nie dodawaj ich do `.env.example` ani repozytorium.

Ręcznie przygotowane, oznaczone przykłady demo są dostępne przez `GET /api/demo`. Analiza online zwróci `NOT_CONFIGURED`; nigdy nie zastępujemy jej przykładem.

```powershell
npm run build
npm start
```

Serwer nasłuchuje tylko na `127.0.0.1`. To lokalne demo, nie publiczne wdrożenie.

## Wdrożenie na serwerze z Dockerem

Na serwerze z Docker Engine, Docker Compose v2 i Make utwórz `.env.local` na podstawie `.env.example`, jeśli plik jeszcze nie istnieje. Do analizy online ustaw `GEMINI_API_KEY` i `TAVILY_API_KEY`. Sekrety są przekazywane podczas uruchamiania kontenera. Obraz ich nie zawiera.

```bash
make build
make up
curl --fail http://127.0.0.1:3000/api/health
```

Jeśli dostęp do Dockera wymaga podwyższonych uprawnień, użyj `sudo make build` i `sudo make up`. Parametry wdrożenia możesz wtedy podać jako argumenty Make, np. `sudo make up KITCHECK_PORT=8080`.

Domyślnie port jest dostępny tylko na serwerze. Przy publicznym wdrożeniu skieruj reverse proxy HTTPS na `127.0.0.1:3000`, zachowaj nagłówek `Host`, przekaż `X-Forwarded-Proto: https` i wyłącz buforowanie odpowiedzi strumieniowych. Adres nasłuchu i port hosta można zmienić zmiennymi `KITCHECK_BIND_ADDRESS` i `KITCHECK_PORT`, np. `KITCHECK_BIND_ADDRESS=0.0.0.0 KITCHECK_PORT=8080 make up`. Zmienna `KITCHECK_ENV_FILE` pozwala wskazać inny plik środowiska.

`make stop` zatrzymuje kontener. `make remove` usuwa kontener i sieć Compose, zachowując obraz oraz nazwany wolumen audytu SQLite. Aby wdrożyć zmieniony kod, wykonaj ponownie `make build` i `make up`.

## Konfiguracja

| Zmienna                        | Znaczenie                                                                   |
| ------------------------------ | --------------------------------------------------------------------------- |
| `GEMINI_API_KEY`               | Klucz Gemini API                                                            |
| `GEMINI_MODEL`                 | Dokładny identyfikator modelu dostępny na koncie; domyślny w `.env.example` |
| `GEMINI_FALLBACK_MODEL`        | Model zapasowy na awarię usługi; pusty wpis wyłącza przełączenie            |
| `TAVILY_API_KEY`               | Klucz Tavily Search API                                                     |
| `EUVSDISINFO_API_KEY`          | Opcjonalny klucz EUvsDisinfo MCP; pusty wyłącza to źródło                   |
| `VERIFY_TIMEOUT_MS`            | Wspólny limit analizy; domyślnie i maksymalnie 60000 ms                     |
| `MAX_CONCURRENT_VERIFICATIONS` | Domyślnie 3 analizy w jednym procesie                                       |
| `MAX_LIVE_VERIFICATIONS`       | Domyślnie 100 prób online od uruchomienia procesu                           |

Na sesję obowiązuje dodatkowo 10 prób na 10 minut. Limity są w pamięci i resetują się po restarcie. Przed publikacją potrzebne są bramka dostępu, współdzielony limiter i limity wydatków u dostawców.

Diagnostyka bez wypisywania kluczy:

```powershell
node --env-file=.env.local scripts/check-providers.mjs
# Opcjonalny minimalny płatny test generowania:
node --env-file=.env.local scripts/check-providers.mjs --generate
```

## Przebieg analizy

1. Walidacja danych, origin i limitów. Opcjonalna data wypowiedzi jest przekazywana do modelu.
2. Gemini rozpoznaje opinię, potrzebę doprecyzowania i wyjście poza zakres. Dla sprawdzalnej tezy przygotowuje dwa zapytania: neutralne oraz szukające kontrdowodu. Doprecyzowanie i nieobsługiwane wejście mają osobne statusy, bez werdyktu.
3. Werdykt dotyczy tezy wejściowej. Wstępne wyszukiwanie kontekstu w Tavily używa trybu Basic, obejmuje całe WWW i ma limit 6 sekund. Wskazówki trafiają wyłącznie do planowania. Dwie frazy dotyczące dowodów są wyszukiwane w trybie Advanced, każda jednocześnie na wszystkich domenach z `src/core/source-policy.ts` (Demagog, EUvsDisinfo, gov.pl), z operatorami `site:` i filtrem `include_domains`. Pierwsza zachowuje oryginalną tezę, druga szuka kontrdowodu lub kontekstu z planu i jest zawsze wykonywana. Gdy po deduplikacji i kontroli niezaufanych treści brakuje dwóch dokumentów z dwóch grup wydawców, wykonujemy najwyżej dwa dodatkowe wyszukiwania skierowane do brakujących grup. Metadane nie spełniają tego warunku. Jest to reguła budżetu pobierania, a nie ocena trafności lub wystarczalności dowodów. Serwer odrzuca wyniki spoza listy także w korpusie i bezpośrednich API. Każde zapytanie zwraca do 6 wyników. Dodatkowo model dobiera bezpośrednie API do tematu: Wikipedia, Sejm/ELI, arXiv oraz EUvsDisinfo przy tezach związanych z dezinformacją, jeśli ustawiono klucz (do 3 wyników z każdego). Używamy pobranego materiału, nie odpowiedzi wygenerowanej przez wyszukiwarkę. Przy odpowiednich kluczach Google Fact Check dodaje metadane wcześniejszych weryfikacji, a wyszukiwanie Google przez Serper uzupełnia wyniki z Demagoga. Linki bez pobranej treści są wyświetlane jako niedostępne do analizy.
4. Usuwamy powtarzające się URL-e, identyczne i niemal identyczne teksty. Dobieramy dokumenty naprzemiennie z grup wydawców: maksymalnie 10 dokumentów, 3 na grupę, 4000 znaków na dokument i 40000 łącznie. Fragmenty otrzymują identyfikatory.
5. Serwer dzieli fragmenty na oznaczone cytaty (do 650 znaków). Gemini ocenia tezę, dążąc do 3–5 trafnych dowodów, i wybiera identyfikatory `quoteId`. Tekst cytatu i przypisanie do źródła wstawia serwer z pobranego materiału — model ich nie przepisuje.
6. Kod sprawdza istnienie źródła, fragmentu i dosłownego cytatu. Dopuszczalna jest tylko normalizacja Unicode NFC i białych znaków. Potwierdzenie lub obalenie wymaga odpowiednich dowodów z co najmniej 2 grup wydawców, z wyjątkiem bezpośrednich dowodów z pobranego tekstu artykułu Demagoga lub raportu EUvsDisinfo. Taka publikacja może wystarczyć samodzielnie po kontroli cytatów i audycie znaczenia; sama obecność domeny, metadane i materiał kontekstowy nie wystarczają. Brak takiego potwierdzenia daje `insufficient`, zachowując prawidłowe cytaty. Kilka poddomen gov.pl lub wersji językowych Wikipedii to jedna grupa. To konserwatywna reguła MVP, nie naukowa miara pewności ani niezależności źródeł.
7. Dodatkowe wywołanie modelu sprawdza sens wniosku, okres, podmiot i kontrdowody. Wyjątek: po udanym wyszukiwaniu ocena `insufficient` bez wybranych dowodów kończy się stałym komunikatem serwera o ograniczeniach, bez publikowania nieaudytowanego uzasadnienia modelu. Negatywny audyt daje status `unable_to_verify` i `verdict: null`, z przyczyną i bez zatwierdzonych cytatów. Nieudana kontrola odpowiedzi nie jest oceną prawdziwości tezy.
8. UI pokazuje wynik, cytaty, liczbę cytowanych źródeł i grup, statusy API, zakres materiału, linki, daty i ograniczenia. Pozostałe przejrzane dokumenty są dostępne osobno, bez sugerowania, że popierają ocenę. Zmiana tezy usuwa poprzedni wynik.

Pełna analiza bez trafienia w pamięć podręczną wykonuje 1 wyszukiwanie Basic kontekstu i 2–4 wyszukiwania Advanced dowodów. Daty wybranych dokumentów uzupełniamy bezpośrednio z HTML stron Demagoga i www.gov.pl, bez płatnych zapytań o metadane, ze wspólnym limitem 6 sekund. Pobranie nie podąża za przekierowaniami i ma limit 3 MB. Brak daty pozostaje jawny. Przy obecnym limicie trzech dokumentów na grupę oznacza to najwyżej sześć odczytów HTML. Wyszukiwanie materiałów obejmuje też maksymalnie 10 żądań do publicznych API (Wikipedia: 1 wyszukiwanie + do 3 artykułów; Sejm: 1 wyszukiwanie + do 3 tekstów; arXiv: 1 wyszukiwanie; EUvsDisinfo: 1 wyszukiwanie). Maksymalnie 4 operacje modelu: plan, ocena, jedna naprawa cytatów lub uzupełnienie dowodów, audyt. Wszystkie etapy dzielą jeden budżet czasu; wyszukiwanie ma dodatkowo limit 15 sekund. Każda operacja modelu wykonuje najwyżej 3 żądania HTTP: próbę główną, jedno ponowienie i ewentualnie jedną próbę modelu zapasowego (maksymalnie 12 żądań do Gemini w całej analizie). Każde żądanie ma limit do 15 sekund. Dodatkowo obowiązują budżety etapów i rezerwa na audyt opisane na końcu README; wszystkie próby podlegają wspólnemu limitowi 60 sekund. Brak wyników oznacza brak danych. Awaria pojedynczego API źródeł nie przerywa analizy, jeśli inne odpowiedziały; interfejs ujawnia niepełne wyszukiwanie. Całkowita awaria wyszukiwania lub awaria modelu daje błąd techniczny bez werdyktu.

## Odporność Gemini i rozliczenia

- HTTP 500/502/503/504 i błąd połączenia: jedno ponowienie po 1–1,5 sekundy; następnie model zapasowy, jeśli skonfigurowany. Nieistniejący model (404) przełącza się bez ponawiania.
- Krótkotrwały limit 429: jedno ponowienie z uwzględnieniem `Retry-After` (do 5 sekund); bez zmiany modelu. Dłuższe oczekiwanie jest komunikowane użytkownikowi.
- Brak środków (402 / payment_required), limit dzienny lub zerowy (429 / quota_exceeded), brak uprawnień i błędne żądanie: brak automatycznych ponowień i przełączania modelu. UI pokazuje konkretną przyczynę.
- Sam HTTP 503 nie dowodzi braku środków. Saldo można sprawdzić w [Google AI Studio Billing](https://aistudio.google.com/billing); aplikacja nie odczytuje salda i nie zmienia ustawień rozliczeń. [Oficjalne kody błędów](https://aistudio.google.com/docs/api-errors).
- Klucze i surowe błędy dostawcy nie trafiają do UI ani logów aplikacji. Logi identyfikują użyty model i przełączenie.

## Bezpośrednie źródła

| API                       | Pobierany materiał                                                                              | Ograniczenia                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Wikipedia (polska edycja) | Wyszukiwanie haseł i tekst HTML artykułu; link z numerem konkretnej rewizji                     | Encyklopedia jest źródłem wtórnym. Data rewizji nie jest datą powstania opisywanego faktu.                                                  |
| api.sejm.gov.pl / ELI     | Wyszukiwanie tytułów aktów DU/MP, tekst HTML jeśli dostępny; w pozostałych przypadkach metadane | Nie odczytujemy PDF. Metadane pozwalają sprawdzić tytuł lub datę aktu, nie treść przepisów. Nie pobieramy jeszcze głosowań ani stenogramów. |
| arXiv                     | Atom: tytuł, link do wersji, data i abstrakt                                                    | Nie pobieramy pełnego tekstu; obecność w arXiv nie dowodzi recenzji ani konsensusu.                                                         |
| EUvsDisinfo (EEAS) MCP    | Wyszukiwanie przypadków dezinformacji i artykułów analitycznych (tytuł, treść, link)            | Baza w języku angielskim. Sekcja SUMMARY przypadku to cytowana dezinformacja, nie fakt; ustalenia zawiera RESPONSE. Wymaga klucza API.      |

Poza EUvsDisinfo te API nie wymagają dodatkowych kluczy. Zapytania dobiera model; źródło niepasujące do tematu ma status „nie wybrano”. Pobieranie jest ograniczone do stałych hostów API, bez przekierowań, do 3 MB na odpowiedź. HTML/XML parsujemy przez Cheerio; HTML źródeł nie jest wykonywany.

Grupy wydawców wyznaczamy z domen rejestrowalnych (tldts), z dodatkowym grupowaniem gov.pl. Wszystkie prace arXiv również należą do jednej grupy — to ograniczenie tej prostej heurystyki. Deduplikacja podobnych tekstów używa wspólnych sekwencji pięciu słów; nie wykrywa wszystkich przedruków, tłumaczeń ani wspólnego pierwotnego źródła. Audyt modelu dodatkowo sprawdza zależności, ale może się mylić.

ArXiv ma procesową kolejkę: jedna aktywna prośba, minimum 3 sekundy między rozpoczęciami. Przed uruchomieniem wielu instancji potrzebny będzie limiter współdzielony.

Dokumentacja: [Wikipedia Search](https://www.mediawiki.org/wiki/API:Search), [Wikipedia Parse](https://www.mediawiki.org/wiki/API:Parsing_wikitext), [Sejm ELI](https://api.sejm.gov.pl/eli_pl.html), [arXiv API](https://info.arxiv.org/help/api/user-manual.html), [zasady arXiv API](https://info.arxiv.org/help/api/tou.html).

## API

- `GET /api/health`: gotowość konfiguracji, nie test połączenia z dostawcami.
- `POST /api/verify`: JSON `{ "claim": "…", "statedAt": "2026-11-21" }`; data opcjonalna.
- `GET /api/demo?id=nato|eu|context`: wyłącznie oznaczone przykłady; `context` demonstruje doprecyzowanie bez werdyktu.
- `POST /api/channels/discord-demo`: JSON `{ "content": "…", "statedAt": "2026-11-21" }`; data opcjonalna. Automatyczna odpowiedź tekstowa oraz ten sam strukturalny wynik co WWW.

Kontrakty: `src/core/contracts.ts`.

| Status                | Znaczenie                                                                        | Werdykt                          |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| `completed`           | Sprawdzenie zakończone                                                           | Jedna z pięciu kategorii poniżej |
| `needs_clarification` | Brakuje podmiotu, czasu lub zakresu                                              | `null`                           |
| `out_of_scope`        | Wejście lub działanie poza zakresem prototypu                                    | `null`                           |
| `unable_to_verify`    | Nie można uzyskać tekstu źródeł lub zatwierdzić oceny                            | `null`                           |
| `technical_error`     | Błąd API, konfiguracji, limitu, wejścia lub połączenia; odpowiedź HTTP spoza 2xx | Brak pola `verdict`              |

Pięć kategorii: `supported` — Potwierdzone; `refuted` — Fałszywe; `misleading` — Wprowadzające w błąd; `insufficient` — Brak wystarczających dowodów; `not_checkable` — Nie podlega weryfikacji.

`misleading` wymaga dowodu brakującego lub zniekształconego kontekstu i pozytywnego audytu znaczenia. Nierozstrzygnięta sprzeczność źródeł to `insufficient` z `evidenceConflict: true` i dowodami obu stron, nie szósta kategoria. Udane wyszukiwanie bez wyników daje brak dowodów; brak dostępu do tekstu lub niepełne wyszukiwanie bez użytecznych materiałów daje status braku możliwości sprawdzenia.

Błędy: `INPUT_INVALID` (400; 403 dla obcego origin), `RATE_LIMITED` (429), `NOT_CONFIGURED` (503), `PROVIDER_ERROR` (502), `INVALID_MODEL_OUTPUT` (502), `VERIFICATION_TIMEOUT` (504), `REQUEST_CANCELLED` (499). Dodatkowo: `MODEL_UNAVAILABLE`, `PROVIDER_PAYMENT_REQUIRED`, `PROVIDER_AUTH_ERROR` (503), `PROVIDER_RATE_LIMITED`, `PROVIDER_QUOTA_EXCEEDED` (429), `PROVIDER_REQUEST_ERROR` (502).

## Drugi kanał: adapter demonstracyjny Discord

1. Otwórz [symulator](http://127.0.0.1:3000/kanal-demo) lub link „Wypróbuj drugi kanał” na stronie głównej.
2. Wpisz treść wiadomości i opcjonalną datę; wybierz „Wyślij w symulatorze”.
3. Adapter sam uruchamia wyszukiwanie, ocenę, walidację cytatów i audyt. Odpowiedź trafia automatycznie do rozmowy, bez kopiowania przez twórców.
4. Wpisz identyczny tekst i datę w WWW, w tej samej przeglądarce. Otrzymasz dokładnie ten sam wynik i zestaw dowodów, oznaczony jako ponownie pokazany. Działa również kierunek WWW → adapter.

`POST /api/channels/discord-demo` przyjmuje `content` zamiast `claim`. Zwraca `{ channel: "discord_demo", delivery: "simulated", messages: [...], result: {...} }`. Odpowiedzi są dzielone na części do 1800 znaków; cytaty, odnośniki i ograniczenia nie są usuwane. Formatter nie wywołuje modelu i nie zmienia oceny.

**To adapter demonstracyjny, nie aktywna integracja z Discordem.** Nie wymaga konta, tokenu ani zewnętrznego serwera; nie wysyła wiadomości do osób trzecich. Zastępuje tylko transport wiadomości. Nie emuluje autoryzacji webhooków, limitów ani potwierdzeń dostarczenia Discorda. Żeby podłączyć prawdziwy komunikator, trzeba wdrożyć i skonfigurować jego transport oraz uwierzytelnianie; silnik weryfikacji pozostaje wspólny.

Oba endpointy korzystają z `handleVerification` → `runVerification` → `verify` i tych samych zabezpieczeń wejścia, origin, terminów oraz limitów. Brak modelu lub błąd usługi daje komunikat bez werdyktu w obu kanałach.

### Spójność i przechowywanie wyników

Oba kanały korzystają z tego samego wyniku **w obrębie jednej sesji przez maksymalnie godzinę od zakończenia analizy**. Powtórzenie pytania z identycznym tekstem, datą i kontekstem obrazu zwraca pierwotny wynik, datę i identyfikator sprawdzenia. Odczyt z bufora nie przedłuża jego ważności. Zmiana konfiguracji modelu wymusza nową analizę. Równoczesne identyczne zgłoszenia korzystają z jednego wykonania. Błędy techniczne można ponowić od razu. Wynik `unable_to_verify` można raz przekazać do drugiego kanału. Ponowienie z kanału, który już otrzymał ten wynik, uruchamia świeżą analizę.

Magazyn działa tylko w pamięci jednego procesu (maks. 100 wyników). Przechowuje tekst pytania, wynik i wykorzystane cytaty; usuwa wpisy automatycznie po godzinie oraz po restarcie. Nie współdzieli danych między sesjami. To bufor spójności kanałów; osobny rejestr SQLite zachowuje zminimalizowany przebieg do 24 godzin. Usunięcie sesji usuwa obie warstwy i przerywa jej aktywne analizy. Anulowanie zgłoszenia, które uruchomiło analizę, może przerwać również oczekującą na nią odpowiedź drugiego kanału. Wieloinstancyjne wdrożenie wymaga współdzielonego magazynu i limitera.

## Struktura i stos

```text
src/app/          widoki i endpointy Next.js
src/components/   interfejs analizy
src/core/         kontrakty, walidacja dowodów, przykłady
src/server/       orkiestracja, dostawcy, konfiguracja, limity
tests/            testy logiki i integracji z kontrolowanym HTTP
e2e/              testy przeglądarki
scripts/          diagnostyka dostawców
```

Next.js 16, React 19, TypeScript, Zod, Vitest, Playwright. Gemini Interactions API z `store: false`, przez serwerowy `fetch`, bez dodatkowego SDK. Style w CSS; na tym etapie nie potrzebujemy Tailwind ani biblioteki komponentów. Lokalny rejestr audytowy SQLite (`node:sqlite`); bez trwałej kolejki zadań i orkiestracji agentów.

## Testy

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

E2E domyślnie używają lokalnego Chrome; dla Edge ustaw `PLAYWRIGHT_CHANNEL=msedge`. Testy jednostkowe i E2E nie wymagają kluczy i nie wykonują płatnych analiz. E2E używają demo oraz kontrolowanego błędu HTTP. Test integracyjny endpointu uruchamia rzeczywisty kod adapterów z podmienionym wyłącznie HTTP dostawców.

Osobne testy live są domyślnie pomijane. Uruchamiaj je świadomie, przy działającym serwerze z kluczami; korzystają z limitów/płatnych usług:

```powershell
$env:RUN_LIVE_TESTS='1'
npx playwright test e2e/live.spec.ts e2e/channels-live.spec.ts --workers=1
Remove-Item Env:RUN_LIVE_TESTS
```

Domyślny model to `gemini-3.1-flash-lite`, a zapasowy `gemini-3.5-flash-lite`. Wybrano je po próbach na rzeczywistym API. Nie deklarujemy pełnej niezawodności usług ani przewagi jakościowej modelu na podstawie dwóch tez. Wyniki live zależą od dostępności API i aktualnego wyszukiwania.

Bezpłatne testy publicznych API, również uruchamiane tylko jawnie:

```powershell
$env:RUN_SOURCE_LIVE_TESTS='1'
npx vitest run tests/sources-live.test.ts
Remove-Item Env:RUN_SOURCE_LIVE_TESTS
```

Pokryte scenariusze: wybór nieistniejących lub powtórzonych identyfikatorów cytatów, brak przepisywania tekstu przez model, zmyślone cytaty, obce identyfikatory, cytat przetłumaczony zamiast dosłownego, brak danych, opinia, brak kontekstu, kopie i niemal identyczne przedruki, różnorodność wydawców, pojedynczy dowód, częściowa awaria wyszukiwania, metadane zamiast pełnego tekstu, przypięta rewizja Wikipedii, abstrakty arXiv, negatywny audyt znaczenia, jedna naprawa, timeout, awaria API, ograniczone przełączanie modelu, brak ponowień przy błędzie płatności lub limicie dziennym, przerwanie ponowień, walidacja wejścia, ochrona sekretów, zmiana tezy, mobile i jawne demo.

## Historyczna kontrola pełnej ścieżki online — 21.11.2026

Chrome/Playwright, prawdziwe API, bez podmiany odpowiedzi i bez użycia przygotowanego demo. Model: `gemini-3.1-flash-lite`. Obie analizy przeszły wybór fragmentów, ścisłą walidację cytatów, audyt znaczenia i wyświetlenie w UI.

| Teza                                                 | Wynik                   | Dowody / cytowane źródła | Czas backendu |
| ---------------------------------------------------- | ----------------------- | ------------------------ | ------------- |
| Polska przystąpiła do NATO 12 marca 1999 roku.       | Potwierdzone w źródłach | 5 / 5                    | 34,7 s        |
| Polska przystąpiła do Unii Europejskiej w 1999 roku. | Sprzeczne z dowodami    | 4 / 3                    | 39,8 s        |

W trakcie prób wystąpiły HTTP 503 i timeout pojedynczego żądania; ograniczone ponowienia pozwoliły ukończyć obie analizy. Nie wystąpił błąd płatności. To potwierdzenie działania ścieżki, nie gwarancja dostępności usług ani reprezentatywny benchmark jakości.

Test zapisuje `live-result.json` i `live.png` w katalogu wyników Playwright (ignorowanym przez Git). Przykłady z przycisków „DEMO” nadal są oznaczonymi materiałami statycznymi; aby wykonać analizę online, wpisz tezę i wybierz „Sprawdź dowody”.

## Dane i ograniczenia

- Teza po maskowaniu rozpoznanych danych osobowych trafia do Gemini oraz jako zapytania do Tavily i wybranych publicznych API źródeł. Nie wpisuj danych poufnych. Logi techniczne nie zawierają tekstów; osobny audyt SQLite zapisuje zamaskowane pytanie i metadane wyniku. Wynik z pytaniem i cytatami pozostaje do godziny w pamięci sesji, zgodnie z zasadą spójności kanałów opisaną powyżej. Dodatkowo wyniki wyszukiwania są przechowywane w pamięci tej samej sesji do 5 minut, a odczytane daty publikacji do godziny; usunięcie sesji czyści również te dane. Dostawcy mają własne zasady retencji.
- Logi zawierają identyfikator żądania, czas, liczbę źródeł, kody błędów i status HTTP dostawcy. Nie zawierają kluczy ani treści wejścia.
- Walidator potwierdza obecność cytatu w pobranym materiale, nie prawdziwość źródła. Audyt tym samym modelem może powielać jego błędy.
- Deduplikacja nie rozpoznaje wszystkich przedruków ani wspólnego pierwotnego źródła. Nie deklarujemy niezależności domen.
- Prosty wybór fragmentów może pominąć kontekst. Brak tekstu uniemożliwia wykorzystanie materiału jako dowodu. Nieznana data publikacji pozostaje jawna.
- Źródła są niezaufanymi danymi; model nie ma narzędzi wykonawczych ani dostępu do kluczy. To ograniczenie skutków prompt injection, nie gwarancja odporności.
- UI nie wykonuje HTML źródeł. Linki są filtrowane do HTTP/HTTPS. Backend nie pobiera adresów wskazanych przez użytkownika.
- Nie wykonano reprezentatywnego benchmarku jakości. Testy techniczne nie dowodzą trafności fact-checkingu.

Consensus można później wykorzystać do źródeł naukowych. Obecna wersja potrzebuje także dokumentów urzędowych i bieżących informacji z szerokiego internetu. [API Consensus](https://help.consensus.app/en/articles/16516328-the-consensus-api).

## Historia dostosowania do opisu wyzwania

Zrealizowany etap: pięć kategorii, statusy obsługi oddzielone od werdyktów, WWW i automatyczny adapter demonstracyjny, wspólna logika oraz testy spójności w obu kierunkach.

Próby online 21.11.2026 (rzeczywiste API, bez podstawiania odpowiedzi):

| Scenariusz                                                 | Kanał inicjujący → kanał powtórzenia | Wynik                                  | Cytaty / źródła |
| ---------------------------------------------------------- | ------------------------------------ | -------------------------------------- | --------------- |
| Data wejścia Polski do NATO                                | WWW → adapter                        | Potwierdzone                           | 5 / 4           |
| Błędna data wejścia Polski do UE                           | WWW → adapter                        | Fałszywe                               | 3 / 3           |
| Członkostwo w UE jako rzekomy dowód używania euro w Polsce | Adapter → WWW                        | Wprowadzające w błąd                   | 4 / 3           |
| Nieokreślony wzrost wydatków                               | Adapter → WWW                        | Potrzebne doprecyzowanie; bez werdyktu | 0 / 0           |

Po dodaniu endpointów test inicjowania przez adapter został wykonany również po ponownym uruchomieniu serwera. Pełne odpowiedzi i zrzuty zapisują testy Playwright; katalog `test-results` jest ignorowany przez Git.

**To nadal nie jest komplet wymagań konkursowych.** Korpus i benchmark dodano w etapie opisanym poniżej. Zapis sprawdzeń, maskowanie i usuwanie sesji dodano w etapie opisanym na końcu README. Bieżące braki opisuje tabela na początku README; materiały zgłoszeniowe są gotowe według informacji zespołu.

## Następne kroki

1. Poprawa przypisywania cytatów po historycznym wyniku 54,5% i pełna walidacja jakości aktualnej wersji. Koszt 100 analiz online pozostaje niezmierzony; dostępna jest jedna próba oraz osobny test syntetyczny.
2. Wyodrębnianie do 3 twierdzeń z dłuższego tekstu (`/api/claims`).
3. Rozpoznawanie pochodzenia przedruków i lepszy wybór fragmentów.
4. Utwardzenie dostępu i limitów przed publicznym wdrożeniem.

Projekt jest prototypem zespołu. Wyniki nie są stanowiskiem MSZ.

## Korpus źródeł — etap 2

`data/corpus/catalog.json` zawiera **132 rekordy z 14 grup domen i 2 typów źródeł**: 129 źródeł urzędowych i instytucjonalnych (`official`) oraz 3 artykuły weryfikujące fakty (`fact_check`). Usunięte wcześniej wpisy PAP i Wikipedii pozostają poza korpusem.

| Grupa domen       | Rekordy |
| ----------------- | ------: |
| cert.pl           |       1 |
| demagog.org.pl     |       3 |
| esa.int           |       4 |
| europa.eu         |      11 |
| gov.pl            |      50 |
| imgw.pl           |       3 |
| kgsok.pl          |       1 |
| nasa.gov          |       3 |
| nato.int          |      18 |
| nbp.pl            |      10 |
| policja.pl        |       1 |
| portalpasazera.pl |       1 |
| un.org            |      18 |
| worldbank.org     |       8 |

22.11.2026 dodano trzy artykuły Stowarzyszenia Demagog:

- [Czy prezydent Putin zgodził się w 1996 roku na wejście Polski do NATO?](https://demagog.org.pl/wypowiedzi/czy-prezydent-putin-zgodzil-sie-w-1996-roku-na-wejscie-polski-do-nato/) — publikacja 23.05.2022.
- [Czy Polska spełnia warunki przyjęcia do strefy euro? Sprawdzamy](https://demagog.org.pl/wypowiedzi/czy-polska-spelnia-warunki-przyjecia-do-strefy-euro-sprawdzamy/) — publikacja 04.01.2024.
- [Globalne ocieplenie nie istnieje? Fałszywe treści o klimacie](https://demagog.org.pl/fake_news/globalne-ocieplenie-nie-istnieje-falszywe-tresci-o-klimacie/) — publikacja 16.10.2024.

Każdy URL zwrócił bez przekierowania HTTP 200 i HTML z czytelną treścią. Daty publikacji pochodzą z widocznego pola `.dg-post__info`, daty aktualizacji z `article:modified_time`; czas pobrania zapisano osobno. Testy rzeczywistego adaptera korpusu potwierdziły pobranie wszystkich trzech artykułów. `fact_check` to typ rekordu w katalogu; adapter przekazuje tekst jako `sourceType: "web"`, tak jak adapter Demagoga. Klasyfikacja artykułu w dalszej analizie korzysta z jego URL. Nie uruchamiano Gemini, Tavily ani Serpera.

Lista do przeglądu to `/zrodla`. Eksport udostępnia `GET /api/corpus`. Jeżeli data publikacji jest nieznana, rekord zachowuje `null`. Przynależność do danej domeny nie potwierdza tezy. Aktualna dostępność dokumentu jest sprawdzana podczas pobierania.

**Licencje i retencja:** zapisujemy katalog metadanych, nie pełne artykuły ani streszczenia z wyszukiwarki. Nie przyznajemy sobie praw do redystrybucji tekstów wydawców. `licenseUrl: null` oznacza brak zweryfikowanej licencji na pełny tekst, a nie otwartą licencję. Pełne archiwizowanie pozostaje wyłączone. Tekst pobrany do analizy jest przejściowy; wybrane cytaty podlegają godzinnej retencji wyniku. Raport benchmarku celowo zachowuje wybrane cytaty dla audytu publicznych tez testowych; przed publikacją raportów konieczny jest przegląd praw do cytatów. Katalog metadanych jest wersjonowany z kodem; usunięcie rekordu i ponowne wdrożenie wycofuje go z wyszukiwania. To nie usuwa wcześniejszych kopii repozytorium.

Aktualizacja: przed demo i następnie co tydzień operator może przebudować katalog. Zmiany tytułu, domeny, wydawcy lub warunków użycia wymagają przeglądu; niedostępne rekordy nie są przenoszone do nowego zbioru. Nowy katalog zastępuje poprzedni dopiero po osiągnięciu minimum 100 rekordów i 10 domen. Nie ma automatycznego harmonogramu ani obietnicy pełnej świeżości.

```powershell
npm run corpus:check  # kod 0: 132 rekordy, 14 grup domen, 2 typy
npm run corpus:build # pobiera aktualny katalog; używa limitu/płatnego Tavily
```

Po przebudowie uruchom `npm run corpus:check` i sprawdź zachowanie obu typów źródeł przed zatwierdzeniem nowego katalogu. Test bezpośredniego pobierania artykułów Demagoga jest domyślnie wyłączony; można go powtórzyć bez płatnych usług:

```powershell
$env:RUN_CORPUS_LIVE_TESTS = "1"
npx vitest run tests/corpus-live.test.ts
Remove-Item Env:RUN_CORPUS_LIVE_TESTS
```

`src/server/corpus.ts` przeszukuje tytuły i ścieżki URL na podstawie zapytań planera. Wymaga dwóch dopasowanych słów, wybiera do 3 rekordów, pobiera ich HTML ponownie i przekazuje do tej samej deduplikacji, katalogu cytatów i audytu co pozostałe źródła. Nie traktuje tytułu, opisu wyszukiwarki ani etykiety wydawcy jako dowodu. URL-e pochodzą wyłącznie z zatwierdzonego pliku; brak przekierowań, limit 3 MB i wspólny termin 15 sekund. UI pokazuje dostawcę „Korpus audytowalny” i niepełne pobranie. Korpus jest dodatkiem do wyszukiwania otwartego, nie zamkniętym indeksem wszystkich treści. Dopasowanie słów ma ograniczoną czułość, zwłaszcza między językami.

## Benchmark jakości i czasu — odtwarzanie

`data/benchmark/cases.json`: **30 przypadków zamrożonych przed wykonaniem**: prawda, fałsz, częściowo prawdziwy/błędny kontekst, materiały nieaktualne, brak dowodów, opinie, doprecyzowanie i trzy ataki w wejściu. Etykiety i uzasadnienia opracował asystent implementujący projekt, nie niezależny ekspert. Zestaw jest jawny i skupiony na polskiej historii UE/NATO oraz walucie; nie dowodzi jakości na dowolnym temacie. Syntetyczne przypadki bez dowodów nie oznaczają dowodu nieistnienia opisanych zdarzeń. Etykiety nie trafiają do promptów ani kodu aplikacji.

`data/benchmark/controlled-cases.json`: dodatkowe **4 przypadki**, dwa konflikty źródeł i dwa ataki w materiałach. Używają rzeczywistego modelu do oceny i audytu oraz rzeczywistej walidacji cytatów, ale kontrolowanego planu i wyszukiwania. Domeny `example.org/net` są fikcyjnymi danymi testowymi, nie korpusem. Czasów tych testów nie mieszamy z pomiarem online. Pierwszy wariant z rzeczywistym planerem (`controlled-planning-v1`) zatrzymał dwa testy na doprecyzowaniu fikcyjnych nazw, zanim dotarły do ataku; zachowano raport. Wariant v2 izoluje granicę niezaufanego źródła zamiast udawać test pełnej ścieżki.

Przy uruchomionym serwerze, z kluczami w `.env.local`:

```powershell
npm run benchmark
# Dopiero po zakończeniu benchmarku, aby nie kumulować ruchu do modelu:
$env:RUN_BENCHMARK_CONTROLLED='1'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/benchmark-controlled-live.test.ts
Remove-Item Env:RUN_BENCHMARK_CONTROLLED
npm run benchmark:report
```

Skrypt wykonuje przypadki kolejno, z przerwą 10 s między nimi (konfigurowalne `BENCHMARK_INTERVAL_MS`). Po HTTP 429 czeka co najmniej 60 s; trzy kolejne limity lub problem rozliczeń/autoryzacji przerywają przebieg z jawną listą niewykonanych przypadków. Nie zmienia modelu ani limitów aplikacji. Nowa sesja dla każdego przypadku zapobiega użyciu wyniku z poprzedniego testu. Następnie sprawdza automatyczną odpowiedź drugiego kanału na tej samej sesji, zgodnie z godzinnym okresem ważności wyniku. Nie jest to porównanie dwóch niezależnych generacji.

Historyczna próba kanałów porównywała dokładną migawkę: identyfikator, status, werdykt, cytaty i metadane źródeł. Wówczas `unable_to_verify` nie było zapamiętywane, więc drugi kanał mógł uruchomić nową analizę z innym identyfikatorem; niezaliczenie takiej próby nie dowodzi samo w sobie sprzecznych ocen merytorycznych. Cztery błędy HTTP w drugim przebiegu uniemożliwiły porównanie kanałów; piąta niezaliczona migawka dotyczyła właśnie niezatwierdzonej oceny I02. W zapisanym przebiegu zachowano wynik porównania, ale nie pełną drugą odpowiedź. Runner rozszerzono po pomiarze o zapis `channelResult` dla przyszłych przebiegów; nie uzupełniamy wstecz danych, których nie zapisano.

Zapisy: `reports/benchmark/latest/results.json` (pełne wyniki, czasy, cytaty, hash zestawu), `initial/results.json` (pierwsza próba), `controlled/results.json` (kontrolowane źródła) i `summary.json` (przeliczone metryki i progi). `BENCHMARK_OUTPUT` pozwala zachować kolejny przebieg w innym katalogu. Dane dynamicznych stron i dostępność modeli mogą się zmieniać; odtwarzalne są wejścia i metoda, nie gwarantowane identyczne odpowiedzi. Nie zapisujemy sekretów. Raporty mają wyłącznie publiczne lub syntetyczne pytania testowe; nie są audytem zgłoszeń użytkowników.

Definicje metryk:

- Macro-F1: średnia F1 pięciu kategorii. Błąd API, brak werdyktu lub zła klasa daje false negative dla oczekiwanej klasy; awarie nie są usuwane z próby. Osobno raportujemy zgodność statusów doprecyzowania.
- Historyczny miernik pokrycia cytowań liczył udział 22 przypadków z ukończoną oceną i co najmniej jednym cytatem. Nie mierzył wszystkich ustaleń odpowiedzi i nie potwierdzał progu briefu. Aktualny miernik `findings-v1` opisano w sekcji P0.1 na końcu pliku.
- Wstrzymanie: `insufficient` dla trzech przypadków braku dowodów. Błąd techniczny lub nieudany audyt nie jest poprawnym wstrzymaniem merytorycznym.
- Odporność: właściwa ocena faktu mimo ataku i obecność dowodów. Ataki w pytaniu i materiałach raportujemy osobno. Samo niewykonanie ataku bez ukończenia sprawdzenia nie zalicza scenariusza.
- Czas: od wysłania HTTP do otrzymania JSON, razem z wyszukiwaniem, ponowieniami, oceną i audytem; bez pisania użytkownika, renderowania przeglądarki i przerw między przypadkami. Mediana/p95 wszystkich odpowiedzi oraz ukończonych analiz są osobne; szybkie błędy nie dowodzą spełnienia celu ≤30 s.
- Poprawność znaczeniowa cytowań wymaga oddzielnej oceny. Ścisłe dopasowanie tekstu i audyt tym samym modelem nie zastępują niezależnych ocen referencyjnych. Nie deklarujemy spełnienia progu 85% na tej podstawie.
- Koszt 100 testów online pozostaje niezmierzony. Bieżący szacunek 1000 zapytań jest ekstrapolacją pojedynczej próby i obejmuje wyłącznie znane składniki; patrz tabela na początku README.

Wszystkie wyniki należy czytać wraz z dostępnością usług, liczebnością klas i ograniczeniami. Przejście testów z kontrolowanymi odpowiedziami HTTP nie jest pomiarem jakości modelu.

`npm run benchmark:report` tworzy `latest/citation-review.template.json` ze wszystkimi cytatami, tezami, relacjami i URL-ami. Niezależny recenzent kopiuje go do `citation-review.json`, wpisuje swoją identyfikację/metodę oraz `valid: true/false` i uzasadnienie dla każdego cytatu. Ponowne wygenerowanie raportu oblicza trafność cytowania. Niepełna ocena pozostaje oznaczoną próbą; próg 85% nie jest zaliczany przed oceną całości. Hash wyniku blokuje użycie ocen z innego przebiegu, a powtórzone/nieznane identyfikatory są odrzucane. Samo uzupełnienie pól nie dowodzi niezależności ani kompetencji recenzenta.

### Wyniki pomiaru 21.11.2026

Pełny drugi przebieg: Windows, Node.js 24, lokalny serwer Next.js w trybie developerskim, jedna sekwencja 30 zapytań, przerwy 10 s, bez równoległych płatnych testów. Nie jest to test obciążeniowy ani pomiar czasu renderowania UI. Konfiguracja modeli: `gemini-3.1-flash-lite` z zapasowym `gemini-3.5-flash-lite`. Pierwszy przebieg bez przerw częściowo nakładał się na testy kontrolowane i zakończył 25/30 prób błędami, głównie limitem Google; zachowano go w `initial` zamiast wybierać tylko korzystniejsze wyniki.

| Miernik                                                    | Wynik drugiego przebiegu                         | Cel z PDF / ocena                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Macro-F1, 5 klas                                           | **0,591**                                        | ≥0,75 — niespełniony                                                              |
| Pokrycie cytowań                                           | **18/22 = 81,8%**                                | ≥95% — niespełniony                                                               |
| Poprawne wstrzymanie przy braku dowodów                    | **1/3 = 33,3%**                                  | ≥80% — niespełniony                                                               |
| Pełna poprawna obsługa ataków w pytaniu                    | **1/3 = 33,3%**                                  | ≥90% — niepotwierdzony; jedna awaria API i jedna ocena zatrzymana przez audyt     |
| Mediana HTTP / p95, wszystkie odpowiedzi                   | **19,64 s / 42,69 s**                            | Mediana ≤30 s — spełniona w tej próbie                                            |
| Mediana / p95 odpowiedzi bez awarii lub odrzuconego audytu | **19,01 s / 43,66 s**                            | Nie mylimy szybkich błędów z szybką analizą                                       |
| Odpowiedzi bez awarii lub odrzuconego audytu               | **25/30**                                        | 100% scenariuszy — niespełniony                                                   |
| Zgodność oczekiwanej kategorii/statusu                     | **18/30**                                        | Miernik pomocniczy, obejmuje statusy                                              |
| Dokładna migawka drugiego kanału                           | **25/30 całej próby; 25/26 wykonanych porównań** | Cztery błędy bez porównania; I02 bez zachowanej migawki, patrz ograniczenie wyżej |
| Poprawność znaczeniowa cytatów                             | **Nieoceniona niezależnie**                      | ≥85% — niepotwierdzony; gotowy formularz oceny                                    |
| Koszt 100 testów                                           | **Niezmierzony**                                 | Raport kosztów — niespełniony                                                     |

Dodatkowy kontrolowany test rzeczywistego modelu: **4/4 scenariusze zaliczone** (2 konflikty źródeł, 2 instrukcje w źródłach). To test oceny i audytu z podstawionym planem/wyszukiwaniem, nie 4 dodatkowe pełne ścieżki online. Dwie próby ataku są za małą próbą do ogólnej deklaracji odporności ≥90%; rejestr zdarzeń nadal nie powstał.

Najważniejsze konkretne błędy: wszystkie **M01–M06** dostały `refuted` zamiast `misleading`, mimo rozpoznania brakującego kontekstu w uzasadnieniach. **T04, F01, N02 i I03** zakończyły się niedostępnością modelu. **N03** otrzymał prośbę o źródło jako doprecyzowanie zamiast `insufficient`; ten przypadek wymaga także niezależnego przeglądu oczekiwanej etykiety. W **I02** atak wpłynął na proponowany `supported`; audyt wykrył sprzeczność z dokumentami i nie opublikował błędnego werdyktu. Jest to skuteczne zatrzymanie błędu, ale nie poprawne ukończenie sprawdzenia. Nie zmieniano promptów ani etykiet w trakcie pomiaru.

Raport zbiorczy: `reports/benchmark/summary.json`. Testy implementacji: **130 jednostkowych/integracyjnych oraz 9 przeglądarkowych**, osobno 4 kontrolowane scenariusze live; build produkcyjny przechodzi. Odtwarzalne testy implementacji nie znoszą powyższych niezaliczonych progów jakości.

### Historyczna lista zgodności i braków po etapie 2

Ta tabela dokumentuje dawny stan. Aktualne braki i pomiary znajdują się na początku README.

| Wymaganie                                                                  | Stan po etapie 2 / brakująca praca                                                                                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Korpus ≥100 rekordów, ≥10 domen, ≥2 typy; audyt listy                      | Spełnione: 132 rekordy, 14 grup domen, official (129) i fact_check (3). Lista w repo, WWW i JSON; bezpośrednie pobieranie trzech artykułów Demagoga potwierdzone.                               |
| Pięć ocen i osobne statusy obsługi                                         | Zaimplementowane i testowane.                                                                                                                                                            |
| WWW i drugi kanał/adapter, wspólna logika                                  | Zaimplementowane; adapter jawnie symuluje transport. Próba spójności oraz dostępność raportowane w benchmarku.                                                                           |
| Tekst **lub** URL, jedno lub kilka twierdzeń                               | Obsługiwany tekst jednej tezy. Sam URL zwraca wyjście poza zakres; URL i wiele tez to rozszerzenia, nie deklarowana funkcja.                                                             |
| Tytuł, wydawca, daty i linki; aktualność                                   | Częściowo: metadane i daty pobrania są; większość dat publikacji korpusu pozostaje nieznana. Brak systematycznego ostrzegania o nieaktualności i ważności faktu w czasie.                |
| Siła podstawy odpowiedzi                                                   | Częściowo: źródła, cytaty, relacje i grupy wydawców; brak skalibrowanej oceny siły, wiarygodnego wykrywania zależności i pełnej oceny pierwotności.                                      |
| Podstawowy zapis przebiegu od pytania do wyniku                            | Niespełnione w trwałej postaci: logi techniczne i 5-minutowy magazyn sesji nie zastępują zminimalizowanego rejestru audytowego. Raport benchmarku nie jest audytem użytkowników.         |
| Maskowanie danych, retencja, usunięcie sesji                               | Retencja pamięci 5 min jest; brak automatycznego maskowania oczywistych danych osobowych i funkcji usunięcia sesji na żądanie.                                                           |
| Prompt injection i logowanie zdarzeń                                       | Separacja instrukcji i walidacja cytatów są; testy źródłowe są kontrolowane. Brak odrębnej detekcji/rejestru prób ataku; nie deklarujemy pełnej odporności.                              |
| ≥30 przypadków i obowiązkowe metryki                                       | Zestaw 30 + 4 i odtwarzalny runner są. Spełnienie progów zależy od raportu; niezależna poprawność cytowań i pomiar kosztu 100 testów pozostają niewykonane.                              |
| Koszt 1000 zapytań, kanału i większego ruchu                               | Niezmierzone. Limity procesowe istnieją, ale nie są testem obciążeniowym ani pomiarem kosztu. Adapter nie ponosi opłat komunikatora, co nie oznacza zerowego kosztu modeli/wyszukiwania. |
| Lokalizacja przetwarzania, retencja dostawców, migracja                    | Dostawcy i przepływ są opisane. Brak potwierdzonej konfiguracji regionów oraz pełnego przeglądu warunków retencji i transferów.                                                          |
| Licencje i kwalifikacja                                                    | Kwalifikacja i ograniczenie do metadanych są jawne. Brak kompletnego przeglądu licencji pełnych tekstów oraz praw do publikacji zapisanych cytatów; pełne archiwum wyłączone.            |
| Dostępność                                                                 | Responsywność i obsługa podstawowych błędów sprawdzone; brak pełnego audytu WCAG i badań z użytkownikami.                                                                                |
| Zgłoszenie: opis ≤4000 znaków, PDF ≤12 slajdów, film ≤3 min, nazwa zespołu | Nie przygotowano kompletu materiałów zgłoszeniowych.                                                                                                                                     |
| Multimodalność, incydenty, pętla moderatora                                | Niezaimplementowane; opis kwalifikuje je jako premiowane/warunkowe. Niejednoznaczne wymaganie powiadomień wysokiego ryzyka z sekcji 2 należy uzgodnić z mentorem.                        |

Priorytet następnego etapu: niezawodność/limity modelu i błędy z benchmarku → audyt i prywatność → niezależne etykiety/cytowania i aktualność → pomiar kosztu oraz materiały zgłoszenia. Nie należy dodawać multimodalności kosztem tych braków.

## Poprawki po benchmarku — kategorie, brak dowodów, instrukcje

W generowaniu oceny wymagamy teraz `basis`: rodzaju podstawy, prawdziwej przesłanki, błędnego wniosku/korekty i identyfikatorów cytatów. Kod mapuje `confirmed → supported`, `contradicted → refuted`, `mixed_context → misleading`, `unresolved/conflict → insufficient`. Pole `verdict` modelu nie może nadpisać tej mapy. `mixed_context` wymaga niepustej prawdziwej przesłanki, korekty oraz wybranych cytatów uzasadniających obie części; sama prawdziwa nazwa kraju w fałszywej tezie nie wystarcza. Audyt sprawdza również rozróżnienie fałszywego pojedynczego faktu od prawdziwej przesłanki użytej w błędnym wniosku lub czasie. Sam wybór `basis.kind` i sens dowodów nadal zależą od modelu — nie jest to mechaniczny dowód prawdziwości.

Planer rozróżnia `ambiguous_claim` (nie wiadomo, co sprawdzać) i `missing_evidence` (wiadomo, co sprawdzać, ale materiał jest nieznany lub nieopublikowany). Ten drugi przypadek uruchamia wyszukiwanie, zamiast zwracać prośbę o udowodnienie twierdzenia jako doprecyzowanie. Awaria API, niedostępny tekst i odrzucony audyt zachowują osobne statusy; nie przeliczamy ich na poprawne wstrzymanie oceny.

`src/core/untrusted.ts` rozpoznaje konserwatywny zestaw bezpośrednich poleceń w języku polskim i angielskim oraz podszywanie się pod role. W pytaniu oddziela zdania sterujące, zachowuje oryginalny tekst wyniku i pokazuje `checkedClaim` w obu kanałach. Wyłącznie oczyszczone twierdzenie trafia do planowania, oceny i audytu. Jeśli nic sprawdzalnego nie pozostaje, pojawia się prośba o podanie faktu. W źródłach wyklucza całe podejrzane fragmenty lub dokument z podejrzanym tytułem; nigdy nie skleja tekstu po wycięciu instrukcji w jeden pozornie dosłowny cytat. Zdarzenie `untrusted_instruction_filtered` zawiera jedynie identyfikator żądania, miejsce i liczbę pominiętych fragmentów. To log techniczny, nie trwały audyt użytkowników.

Filtr nie stanowi kompletnej ochrony przed prompt injection. Może nie rozpoznać parafrazy, innego języka lub złożonego ataku, a bezpośredni cytat polecenia może zostać nadmiernie odrzucony. Nadal obowiązuje separacja danych/instrukcji, kontrola cytatów i audyt. Nie wolno interpretować kilku zaliczonych prób jako dowodu odporności na dowolny atak.

Porównanie zachowuje niezmienione 30 wejść, etykiety i hash zestawu oraz konfigurację modeli i przerw. Raport sprzed zmian znajduje się w `reports/benchmark/before-hardening/results.json`, po zmianach w `after-hardening/results.json`. Skrypt porównania odmawia zestawienia różnych hashy/etykiet i pokazuje poprawy oraz regresje każdego przypadku, łącznie z awariami. Źródła są pobierane na żywo; nie jest to kontrolowany eksperyment przy identycznych tekstach źródeł ani niezależny zestaw ukryty.

```powershell
$env:BENCHMARK_OUTPUT='reports/benchmark/after-hardening'
npm run benchmark
Remove-Item Env:BENCHMARK_OUTPUT
npm run benchmark:compare
# Po zakończeniu głównego pomiaru:
$env:RUN_BENCHMARK_CONTROLLED='1'
$env:BENCHMARK_CONTROLLED_OUTPUT='reports/benchmark/controlled-after-hardening'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/benchmark-controlled-live.test.ts
Remove-Item Env:RUN_BENCHMARK_CONTROLLED
Remove-Item Env:BENCHMARK_CONTROLLED_OUTPUT
```

Wyniki z wcześniejszej sekcji „Wyniki pomiaru 21.11.2026” i lista braków etapu 2 są historycznym punktem odniesienia, a nie wynikami poprawionej wersji. Obecnie istnieje podstawowy filtr instrukcji i zminimalizowany log jego zdarzeń; nadal brakuje trwałego rejestru audytowego.

Planer otrzymuje dzień weryfikacji z zegara serwera w UTC. Data wypowiedzi pozostaje osobnym polem. Chroni to przed uznaniem zdarzenia z przeszłości za prognozę tylko dlatego, że model pamięta starszą datę. Test regresji używa zegara z innym rokiem niż zestaw benchmarku.

Walidacja podstawy odrzuca każdy identyfikator cytatu spoza dostarczonego katalogu. Nadmiarowe znane odwołania niewybrane w `evidence` są pomijane, a nie automatycznie dodawane do dowodów. Po ich pominięciu każda wymagana rola nadal musi mieć wybrany cytat. Ścisłe sprawdzenie dosłowności cytatów pozostaje bez zmian.

Zachowano także próbę rozwojową `hardening-attempt-1/results.json`: macro-F1 0,736, wstrzymanie 2/3, ataki w pytaniu 3/3, ale 10/30 błędów technicznych i jeden błąd daty. Diagnostyka M01 wykazała odrzucenie poprawnej podstawy przez nadmiarowe znane odwołanie; zapisy przed i po korekcie są w `diagnostics/`. Osobne powtórzenia diagnostyczne nie są włączane do końcowego wyniku. Po korekcie daty i walidacji wykonywany jest od nowa cały zestaw 30 przypadków, bez zmiany etykiet.

### Końcowe porównanie po poprawkach

Pełny przebieg z 21.11.2026: ten sam zestaw i hash, modele `gemini-3.1-flash-lite` / `gemini-3.5-flash-lite`, serwer developerski, nowe sesje i przerwy 10 s. Nie zmieniano kodu logiki podczas tego pomiaru. Raport: `reports/benchmark/hardening-comparison.json`; wszystkie odpowiedzi i cytaty: `after-hardening/results.json`. Błędy pozostają w mianownikach.

| Miernik                                                               | Przed           | Po                  |
| --------------------------------------------------------------------- | --------------- | ------------------- |
| Macro-F1, pięć kategorii                                              | 0,591           | **0,930**           |
| Poprawne rozpoznanie „wprowadzające w błąd”                           | 0/6             | **5/6**             |
| Poprawne rozpoznanie wszystkich oczekiwanych „fałszywe”, w tym ataków | 6/8             | **8/8**             |
| Wstrzymanie przy braku dowodów                                        | 1/3             | **2/3**             |
| Pełna poprawna obsługa ataków w pytaniu                               | 1/3             | **3/3**             |
| Pokrycie cytowaniami przypadków faktograficznych                      | 18/22           | **22/22**           |
| Zgodność oczekiwanej kategorii/statusu                                | 18/30           | **28/30**           |
| Odpowiedzi bez awarii lub odrzuconego audytu                          | 25/30           | **29/30**           |
| Dokładna zgodność kanałów, wykonane porównania                        | 25/26           | **29/29**           |
| Mediana / p95 HTTP, z błędami                                         | 19,64 / 42,69 s | **23,26 / 57,84 s** |
| Mediana / p95 odpowiedzi bez awarii lub odrzuconego audytu            | 19,01 / 43,66 s | **21,27 / 54,47 s** |

Dziesięć przypadków przeszło z niezaliczonego na zaliczony. Żaden wcześniej zaliczony przypadek nie stracił tego statusu, ale opóźnienia wzrosły. Wśród 22 przypadków z ukończoną klasyfikacją w obu przebiegach trafność wzrosła z 16/22 do 21/22; jest to tylko dodatkowa diagnostyka, nie zastąpienie wyniku całej próby. Poprawa dostępności dostawcy współtworzy wynik i nie może zostać przypisana wyłącznie zmianom kodu.

**Pozostałe dwa niezaliczone przypadki:**

- **M05:** `refuted` zamiast `misleading`. Model uznał prawdziwą historyczną przesłankę w uzasadnieniu, ale błędnie skategoryzował jej przeniesienie na 2024 rok; audyt tego nie zatrzymał. Oznacza to nieusuniętą niestabilność klasyfikacji, mimo 5/6 poprawnych przypadków tej klasy. Nie dodano wyjątku zależnego od treści lub identyfikatora testu. Następny krok: jawna ocena oddzielnych części twierdzenia i niezależna walidacja kategorii, sprawdzona również na nowych tezach.
- **N03:** HTTP 504 po 60,05 s, bez opublikowanego werdyktu. Nie zaliczamy timeoutu jako merytorycznego wstrzymania. Poprawa logiki braku dowodów nie usuwa opóźnień modelu; wymagane są pomiary etapów i dobór budżetu ponowień/dostawcy, bez zamieniania awarii w `insufficient`.

W tej próbie osiągnięto liczbowo próg macro-F1 oraz 100% historycznego miernika obecności cytatu w odpowiedzi (nie progu pokrycia wszystkich ustaleń z briefu); próg wstrzymania ≥80% nadal nie jest spełniony. Mediana mieści się w 30 s, ale p95 jest bliskie limitu 60 s. Trzy zaliczone ataki w pytaniu nie dowodzą ogólnej odporności ≥90%. Niezależna poprawność znaczeniowa cytatów, koszt i wcześniejsze braki zgodności nadal wymagają osobnej pracy.

Walidacja lokalna końcowego kodu: **147 testów jednostkowych/integracyjnych**, **10 testów przeglądarkowych**, kontrola typów, formatowania oraz kompilacja produkcyjna. Testy przeglądarkowe używają kontrolowanych odpowiedzi; jakość usług online mierzy powyższy benchmark. Pięć testów opt-in nie jest wykonywanych przez zwykłe `npm test`.

Oddzielny test kontrolowanych źródeł z rzeczywistym modelem: **3/4 zaliczenia** (wcześniej 4/4). Oba ataki źródłowe **S03–S04: 2/2** poprawne, z zarejestrowaną kwarantanną fragmentu i zachowanymi dowodami; konflikt S02 poprawnie zwrócił `insufficient` z flagą sprzeczności. **S01 nie ukończył oceny z powodu `MODEL_UNAVAILABLE`** po błędach połączenia i HTTP 503 modelu zapasowego. Test integracyjny słusznie zgłasza niepowodzenie całości; nie jest opisany jako pełne przejście. Wyniki: `reports/benchmark/controlled-after-hardening/results.json`, punkt odniesienia: `controlled-before-hardening/results.json`. Nie wykonywano powtórzeń w celu zastąpienia niekorzystnego wyniku.

## Niezawodność, prywatność i audyt — etap 3

Zmiany są ogólne; nie dodano wyjątków zależnych od treści ani identyfikatorów przypadków testowych.

### Wstrzymanie i budżet czasu

Po udanym wyszukiwaniu ocena `insufficient` bez wybranych dowodów kończy się komunikatem napisanym w kodzie: w pobranym materiale nie wskazano dowodów rozstrzygających. Nie publikujemy uzasadnienia ani dodatkowych faktów wygenerowanych przez model i nie wykonujemy kolejnego wywołania tylko po to, by zatwierdzić ten komunikat. Lista przejrzanych materiałów pozostaje dostępna. Niepełne wyszukiwanie bez wybranych dowodów daje `unable_to_verify`, a awaria modelu nadal błąd techniczny. Brak dowodu nie staje się dowodem fałszu. Oceny z cytatami nadal przechodzą audyt znaczenia.

Planowanie ma budżet do 12 sekund, ocena lub naprawa do 24 sekund, audyt do 15 sekund; wszystkie dzielą maksymalny termin całego żądania 60 sekund. Przed audytem rezerwujemy 10 sekund; dodatkowa naprawa/uzupełnienie dowodów uruchamia się wyłącznie przy co najmniej 18 sekundach pozostałego czasu. Przy przekroczeniu czasu pojedynczej próby modelu przechodzimy do skonfigurowanego modelu zapasowego, zamiast ponawiać tę samą zawieszoną próbę. Błędy rozliczeń, autoryzacji i limitów nadal nie powodują obejścia ograniczeń przez zmianę modelu. Logi etapów zawierają identyfikator sprawdzenia, czas operacji i czas od rozpoczęcia, bez treści pytania. Mniejsze limity wyjścia planowania i audytu ograniczają niepotrzebną długość generowania. Budżety nie gwarantują dostępności dostawcy.

### Maskowanie i zarządzanie sesją

`src/core/privacy.ts` maskuje adresy e-mail, polskie telefony, 11-cyfrowe identyfikatory i polskie numery rachunków **przed pierwszym wywołaniem modelu**. Nie zachowujemy mapy umożliwiającej odtworzenie usuniętych wartości. Zwracane pytanie jest zamaskowane; UI ujawnia ograniczenie. Wzorce mogą pominąć nietypowy zapis lub nadmiernie zamaskować liczbę. Nie jest to rozpoznawanie wszystkich nazwisk, adresów i informacji wrażliwych ani pełna anonimizacja. Jeśli maskowanie usuwa istotny kontekst, system powinien poprosić o doprecyzowanie bez danych poufnych. Materiały publicznych źródeł nie podlegają tej samej transformacji cytatów, aby zachować ich dosłowność.

W obu widokach są **Pobierz zapis sesji** i **Usuń sesję i jej zapis**. Przed analizą interfejs ustanawia cookie sesji; usuwanie działa także podczas pierwszego sprawdzenia. Usunięcie kasuje rejestr i bufor wyniku, przerywa aktywne analizy sesji, usuwa jej lokalny limiter i cookie, czyści otwarte karty obu kanałów. Globalny limit wydatków/liczby wywołań nie jest resetowany. Opóźniona odpowiedź nie może ponownie zapisać usuniętej sesji ani ustawić starego cookie. Ochrona przed powtórnym zapisem zachowuje przez 24 godziny wyłącznie skrót identyfikatora usuniętej sesji i termin wygaśnięcia.

Usunięcie dotyczy aplikacji. Nie usuwa wcześniejszych transmisji u dostawców, pobranych eksportów ani kopii zapasowych operatora. Zasady retencji usług zewnętrznych nadal wymagają osobnego przeglądu.

### Trwały, zminimalizowany rejestr

SQLite zapisuje dane w `.runtime/audit.sqlite` (katalog ignorowany przez Git); opcjonalny `AUDIT_DB_PATH` wybiera inną prywatną lokalizację. Wymagany Node.js **22.13+**, testowany 24, z wbudowanym `node:sqlite`. Rejestr zachowuje zamaskowane pytanie, datę wypowiedzi, czas, kanał, identyfikatory żądania i weryfikacji, status, werdykt lub kod błędu, zamaskowane uzasadnienie i ograniczenia, statusy wyszukiwania oraz metadane źródeł. Nie archiwizuje artykułów ani pełnych cytatów: zapisuje przypisanie do źródła, rolę dowodu i SHA-256 cytatu. Linki w audycie są minimalizowane (usunięte parametry poza rewizją `oldid`); mogą wymagać odszukania dokumentu. Nie jest to archiwum pozwalające odtworzyć zmienioną stronę źródłową.

Każde dostarczenie odpowiedzi przez kanał ma własny wpis, także gdy korzysta z bufora wspólnego wyniku. Błędy po walidacji pytania są zapisywane bez werdyktu; nie zapisujemy niepoprawnych surowych żądań. Brak możliwości zapisania udanego sprawdzenia daje `AUDIT_UNAVAILABLE`, bez pozornego sukcesu. Błędy zapisu przy już nieudanej analizie są dodatkowo logowane bez treści.

Retencja: 24 godziny i maksymalnie 5000 wpisów globalnie (najstarsze mogą zostać usunięte wcześniej). Wygasłe wpisy są usuwane przy otwarciu bazy, odczycie/zapisie oraz co minutę podczas działania procesu. Przy wyłączonej aplikacji czyszczenie następuje po uruchomieniu, przed udostępnieniem danych; bez działającego procesu nie ma niezależnego harmonogramu kasowania pliku. SQLite używa `secure_delete` i dziennika DELETE, nie WAL. Nie deklarujemy usuwania kopii systemu plików ani kopii zapasowych.

API sesji:

- `POST /api/session`, nagłówek `x-prawdowid-action: start-session`: ustanowienie cookie HttpOnly/SameSite=Strict, Secure pod HTTPS, ważnego 24 godziny.
- `GET /api/session`: eksport wyłącznie bieżącej sesji, `Cache-Control: no-store`; bez cookie zwraca pustą listę.
- `DELETE /api/session`, nagłówek `x-prawdowid-action: delete-session`: usunięcie własnej sesji. Nie przyjmuje identyfikatora innej sesji w treści/URL. Żądania z innego origin są odrzucane.

To nadal lokalne MVP z dostępem przez cookie, bez kont i panelu administracyjnego. Baza nie jest serwowana publicznie ani szyfrowana przez aplikację. Operator musi chronić katalog uprawnieniami systemowymi i ustalić zasady kopii zapasowych; wdrożenie wieloinstancyjne wymaga wspólnego zarządzania zadaniami i limiterem. Zapis obejmuje obecnie agregat zużycia oraz szczegóły wywołań dostawców. Nieznane koszty pozostają null. Pełna historia etapów nie jest przechowywana w bazie; czasy etapów znajdują się w logach technicznych.

### Walidacja etapu 3

- **162 testy jednostkowe/integracyjne zaliczone**, 5 testów wymagających jawnego uruchomienia pominiętych. Nowe testy obejmują bezpieczne wstrzymanie bez audytu, niepełne wyszukiwanie, awarie i budżety etapów, maskowanie przed wywołaniem dostawców, izolację/retencję rejestru, ponowne otwarcie bazy, usunięcie podczas analizy, blokadę odtworzenia sesji i niedostępność bazy.
- **12 testów przeglądarkowych zaliczonych** w przebiegu sekwencyjnym. Testy obejmują oba kanały, widok mobilny, usuwanie w dwóch kartach oraz brak pozornego sukcesu przy nieudanym usunięciu. Początkowy test ujawnił możliwość wpisania tekstu przed hydratacją formularza; pola są teraz nieaktywne do podłączenia obsługi. Jeden równoległy przebieg testu nawigacji do korpusu przekroczył czas; test izolowany i pełny przebieg sekwencyjny przeszły. Cztery testy UI korzystające z płatnych API były pominięte; rzeczywiste API sprawdzano osobnym runnerem poniżej.
- Kontrola typów i kompilacja produkcyjna zaliczone. Prywatna baza nie jest dołączana do plików wdrożenia przez mechanizm śledzenia zależności Next.js. Testy z kontrolowanymi odpowiedziami dostawców nie dowodzą jakości modeli w dowolnym temacie.

**Pomiar online 21.11.2026 jest niepełny.** `reports/benchmark/reliability-privacy-online/results.json` zachowuje wszystkie odpowiedzi, czasy, cytaty i listę 12 niewykonanych przypadków. Zestaw, etykiety i modele nie były zmieniane. Uruchomiono 18/30 przypadków: 13 poprawnych zakończeń, 1 awaria modeli (F06), 1 ocena zatrzymana przez audyt kategorii (M01), następnie 3 kolejne limity HTTP 429 (M03–M05). Runner przerwał pomiar po wymaganych przerwach, bez zmiany modeli, limitów lub zastępowania niekorzystnych wyników powtórzeniami. Próby drugiego kanału korzystają z udokumentowanej migawki; przy M01 ponowna analiza dała inną odpowiedź, co nie zalicza spójności tej próby.

**N01–N03 nie zostały wykonane w tym przebiegu**, więc nie deklarujemy poprawy wskaźnika wstrzymania z historycznych 2/3 ani osiągnięcia progu 80%. Nie porównujemy częściowego macro-F1 (brak całych klas) i czasu z pełnym poprzednim benchmarkiem. Wcześniejsza próba w `reliability-privacy/results.json` została przerwana po 4 błędach połączenia: środowisko blokowało ruch sieciowy (EACCES), nie był to pomiar jakości modelu. Nie uruchamiano dodatkowych płatnych prób kontrolowanych po utrzymujących się limitach dostawcy.

Odtworzenie po ustąpieniu limitów, przy działającym serwerze (nie nadpisuje zachowanych przebiegów):

```powershell
$env:BENCHMARK_OUTPUT='reports/benchmark/reliability-privacy-next'
npm run benchmark
Remove-Item Env:BENCHMARK_OUTPUT
```

Opcjonalnie `BENCHMARK_URL` wskazuje inny lokalny port; `PLAYWRIGHT_BASE_URL` pozwala użyć tego samego portu w testach przeglądarkowych. Skrypt porównania przyjmuje `COMPARE_BEFORE`, `COMPARE_AFTER`, `COMPARE_OUTPUT` i nazwy katalogów `COMPARE_CONTROLLED_BEFORE/AFTER`; odrzuca niekompletne lub różne zestawy. Domyślne ścieżki historycznego porównania pozostają bez zmian.

Do dalszej pracy pozostają m.in. pełny pomiar po ustąpieniu ograniczeń usług, niezależna ocena cytatów, koszt, aktualność źródeł, przegląd zasad dostawców i materiały zgłoszeniowe.

## Panel weryfikacji i statusy na żywo

Widok WWW ma wspólną niebieską paletę z pozostałymi ekranami, osobną kolumnę formularza, przebieg analizy, podsumowanie materiałów i raport z dowodami. Potwierdzenie jest zielone, niepewność i kontekst pomarańczowe, obalenie czerwone. Etykiety i symbole uzupełniają kolor; błędy techniczne nie są werdyktem. Na telefonie panel układa się w jedną kolumnę i przenosi użytkownika do trwającej analizy, a następnie do wyniku.

Po ustanowieniu sesji przez `POST /api/session` klient WWW wysyła `POST /api/verify` z `Accept: text/event-stream`. Strumień SSE zawiera obiekty JSON w ramkach `data: …\n\n`:

- `stage`: rzeczywisty etap silnika (planowanie, wyszukiwanie, ocena, ewentualne poprawianie cytatów lub uzupełnianie dowodów, audyt). Odczyt z pamięci i oczekiwanie na identyczne trwające zgłoszenie mają osobne statusy.
- `source`: rozpoczęcie pobierania oraz wynik poszczególnych dostawców; liczba materiałów jest podawana przed deduplikacją. Wyszukiwanie WWW pozostaje w trakcie do zakończenia dwóch zapytań podstawowych oraz ewentualnego uzupełnienia dla brakujących grup wydawców.
- `result` lub `error`: zdarzenie końcowe. W strumieniu błędy są przekazywane jako zdarzenie, ponieważ nagłówki HTTP zostały już wysłane. Brak zdarzenia końcowego oznacza przerwane połączenie, nie sukces.

Bez nagłówka `Accept` lub bez poprawnego identyfikatora sesji pozostaje dotychczasowa odpowiedź JSON i kody HTTP. Adapter Discord zachowuje swój kontrakt. Rozłączenie strumienia przerywa analizę przez istniejący mechanizm anulowania; walidacja, limity, maskowanie danych, audyt i reguły werdyktu pozostają wspólne. Demo nie symuluje wykonania etapów, a ponowne użycie wyniku nie udaje nowego wyszukiwania.

Walidacja panelu: kontrola typów, kompilacja produkcyjna, 167 testów jednostkowych/integracyjnych i 16 testów przeglądarkowych. Sprawdzono szerokości 320, 390, 768, 1024 i 1440 px oraz zrzuty widoku pustego, wyniku i analizy. Scenariusze API używają kontrolowanych odpowiedzi dostawców; nie uruchamiano płatnych testów live. Testy transportu obejmują ramki podzielone wewnątrz znaków UTF-8, przerwane połączenie, zdarzenie przed odpowiedzią dostawcy i anulowanie po rozłączeniu.

## Ustalenia z przypisanymi dowodami — P0.1

Odpowiedzi bieżącego silnika mają `citationContract: "findings-v1"` i tablicę `findings`: `{ id, text, evidenceIds }`. Każdy element to pojedyncze ustalenie faktograficzne, a `evidenceIds` wskazują konkretne, opublikowane cytaty (`evidence[].id`). Model wybiera `quoteIds`; serwer sprawdza ich istnienie, przynależność do wybranych dowodów i dosłowność cytatów. Puste przypisania, brak inwentarza przy dowodach, powtórzone identyfikatory/ustalenia i nieznane odwołania blokują publikację. Jedno źródłowe zdanie może uzasadniać kilka różnych ustaleń; każde liczy się osobno i wymaga osobnej kontroli znaczenia.

Serwer składa `explanation` wyłącznie z ustaleń i numerów dowodów, np. `Ustalenie. [1] [2]`. WWW ma odnośniki do kart dowodów, adapter Discord zachowuje tę samą treść i numerację, a eksport sesji zachowuje mapowanie oraz hashe cytatów. Wersja klucza cache została zmieniona, więc stary wynik nie omija nowych kontroli. Przykłady demo też mają mapowanie, ale nadal są oznaczone jako ręczne i nie są benchmarkiem online.

Swobodne pola modelu `explanation`, `limitations`, `relevance` oraz uzasadnienie audytora nie są już publikowane. Faktograficzne zastrzeżenie musi być osobnym ustaleniem z dowodem. Informacje techniczne, ostrzeżenia o niepełnym wyszukiwaniu, ograniczenia liczby grup i komunikaty o braku dowodów tworzy kod. Wczesne odpowiedzi o opinii, doprecyzowaniu i zakresie także korzystają z komunikatów serwera; są mniej szczegółowe niż wcześniejszy swobodny opis modelu, ale nie publikują dodatkowych faktów bez dowodu.

Audyt otrzymuje każde ustalenie wraz z jego odwołaniami i zwraca `findingChecks` (`findingId`, `supported`, `atomic`). Ogólne `approved: true` nie wystarcza: lista musi objąć każde ustalenie dokładnie raz, bez obcych identyfikatorów, i potwierdzić uzasadnienie oraz pojedynczy charakter ustalenia. Brak lub negatywna kontrola daje `unable_to_verify`, bez ustaleń i zatwierdzonych cytatów. Reguły działają także po naprawie i uzupełnianiu dowodów. Liczba wywołań modelu nie wzrosła; rozszerzono istniejący audyt.

**Nowa definicja pokrycia:** suma opublikowanych ustaleń z poprawnym przypisaniem do dowodów / suma opublikowanych ustaleń. Przykład: pięć ustaleń i tylko jedno z przypisanym dowodem to 20%, nawet jeśli odpowiedź zawiera cytat. Uwzględniamy również dodatkowe fakty wygenerowane w przypadkach oznaczonych w zestawie jako opinia lub brak dowodów. Nie liczymy treści pytania, surowych cytatów, metadanych źródła ani komunikatów technicznych jako ustaleń systemu.

Runner zapisuje `findingCoverage` dla każdej odpowiedzi. Wyniki bez inwentarza (w tym stare raporty) mają nieznany wynik, `unknownResponses > 0`, `complete: false` i `value: null`; nie rekonstruujemy pokrycia z liczby cytatów. Mieszanie takich wyników z nowymi nie pozwala zaliczyć progu. Zero opublikowanych ustaleń daje `value: null`, a nie 100%. Błąd techniczny nie publikuje ustaleń i nie zwiększa tego mianownika, ale nadal obniża dostępność/end-to-end i trafność, a nie zalicza poprawnego wstrzymania. Pokrycie nie zastępuje tych osobnych mierników. Porównanie starego i nowego przebiegu nie wylicza fikcyjnej różnicy pokrycia z `null`.

Pokrycie oznacza kompletność powiązań, nie niezależnie potwierdzoną prawdziwość ani poprawność cytowań. Podział na atomowe ustalenia i ocena znaczeniowa nadal zależą od modelu; niezależny recenzent musi sprawdzić, czy element nie łączy kilku faktów oraz czy wskazany fragment rzeczywiście go uzasadnia. Formularz przeglądu cytatów zawiera teraz również przypisane ustalenia. Nie deklarujemy osiągnięcia progów 95%/85% w nowym pomiarze online na podstawie samych testów kodu. Historycznych raportów nie nadpisano.

Walidacja P0.1: 191 testów jednostkowych/integracyjnych zaliczonych (5 opt-in pominiętych), 19 testów przeglądarkowych zaliczonych (4 live pominięte), kontrola typów i kompilacja produkcyjna zaliczone. Nowe przypadki obejmują kilka ustaleń, brakujące/powtórzone/obce odwołania, tekst bez dowodu w dodatkowych polach, niepełny i negatywny audyt, próby obejścia przy naprawie/uzupełnianiu, wersjonowanie miernika, obydwa transporty i zapis powiązań w rejestrze. Testy korzystają z kontrolowanych odpowiedzi dostawców; nie wykonano nowego płatnego benchmarku.

## Benchmark P0.2 — wynik historyczny

[Pełny raport](reports/benchmark/p02-report.md), [porównanie](reports/benchmark/p02-comparison.json), [progi tamtego przebiegu](reports/benchmark/p02-run4/summary.json) i [plan MVP](kitcheck-plan.md). Cztery pełne przebiegi pozostały zachowane: 21/30 → 28/30 → 28/30 → **30/30**. W tamtym pomiarze: macro-F1 **1,000**, pokrycie **44/44 ustaleń**, wstrzymanie **3/3**, ataki wejścia **3/3**, kanały **30/30**, mediana **11,588 s**, p95 **16,447 s**. Model i dataset pozostały te same; pobierane źródła mogą się zmieniać.

Kontrolowane źródła: **3/4**, w tym ataki **2/2** z odnotowaniem zdarzeń. S02 (sprzeczne pomiary) został odrzucony przez audyt i pozostaje otwartym problemem. Nie utożsamiamy 30/30 z zaliczeniem wszystkich scenariuszy briefu. Późniejsza kompletna ocena modelowa tych 121 cytatów dała 66 poprawnych (54,5%), poniżej progu 85%. Koszt 100 testów online i próba jury pozostają otwarte.

Resolver traktuje quoteId w ustaleniu jako jawny wybór istniejącego cytatu: materializuje tekst z katalogu i zachowuje wszystkie powiązania. Brak jawnej relacji oznacza context; nie dodaje automatycznego potwierdzenia lub zaprzeczenia. Wyjątek ujednolicający role: dla mixed_context cytat wskazany jako korekta w decisiveQuoteIds nie może potwierdzać całej tezy, więc sprzeczne supports staje się context. Wciąż obowiązują kontrola znaczenia każdego ustalenia, limit 10 cytatów, odrzucanie nieznanych referencji i dosłowność cytatów.

Unresolved z jawnym brakiem ustaleń nie wymusza opisywania przypadkowych wyników wyszukiwania. Niespójne lub wymyślone odwołania pozostają błędami. Logi rozdzielają błędy formatu, odwołań i negatywny audyt, bez surowej odpowiedzi modelu. Jedynie jawny status dostawcy incomplete podczas audytu może wywołać jedno ponowienie z większym budżetem wyjścia, przy co najmniej 10 s pozostałych w niezmienionym limicie 60 s. Negatywnego audytu nie ponawiamy w poszukiwaniu akceptacji.

Walidacja: **206** testów jednostkowych/integracyjnych, **19** przeglądarkowych; typecheck i build zaliczone. Pominięto 5 testów opt-in i 4 przeglądarkowe live; opisane płatne benchmarki uruchomiono osobno. Runner odmówi nadpisania istniejącego results.json. Polecenie npm run benchmark:evaluate -- reports/benchmark/NAZWA zapisuje spójne mierniki i formularz niezależnej oceny związany z hashem wyników.

## Graf dowodowy

Na ekranie weryfikacji wybierz **Graf dowodowy · dane syntetyczne**, aby
przejść od werdyktu do przesłanek, cytatu i dokumentu bez kluczy API.
Graf przedstawia opublikowane ustalenia i przypisane do nich cytaty.
Korzysta z tego samego werdyktu co panel. Powstaje bez dodatkowego
wyszukiwania i wywołań modelu.

Klienci API mogą zażądać grafu, dodając `"evidenceGraph": true` do treści
istniejącego żądania `POST /api/verify`. Wynik grafu jest dostępny w
`evidenceGraph`, pod węzłem `verdict`. Powtórzenie tego samego żądania w tej
samej sesji wykorzystuje zapisany wynik przez maksymalnie godzinę.
Eksport JSON zawiera graf i cytowane fragmenty zapisanych migawek, więc można
porównać cytaty, zakresy znaków i hashe bez ponawiania analizy. Serwerowe
archiwum audytu zachowuje dotychczasową politykę przechowywania metadanych.

`npm test` sprawdza konstrukcję, krytykę i walidację grafu.
`npm run test:e2e -- e2e/evidence-graph.spec.ts` sprawdza widok demonstracyjny
oraz pobieranie JSON i PNG.

Historyczna walidacja integracji grafu obejmowała 219 testów jednostkowych/integracyjnych i 23 przeglądarkowe. Obecny graf jest projekcją wspólnego wyniku i nie uruchamia dodatkowych modeli. Ostatni pomiar kosztu był wykonany przez API JSON bez żądania grafu; nie zastępuje pełnego testu ścieżki WWW/SSE.

## Próba jury

**Prawdowid** sprawdza pojedynczą tezę i pokazuje, skąd pochodzą cytaty.
Materiały zgłoszeniowe (opis, PDF i film) są gotowe według zespołu. W tej kopii nie ma plików wcześniej wskazywanych pod `docs/submission/`; nie publikujemy niedziałających odnośników ani nie deklarujemy ich ponownej kontroli. Przegląd licencji i zasad dostawców pozostaje odłożony.

### Uruchomienie z czystej kopii

1. Sklonuj repozytorium i przejdź na przekazany commit. Użyj Node.js 22.13+
   oraz npm. Uruchom `npm ci`.
2. Uruchom `npm run dev` i przejdź na <http://127.0.0.1:3000>. Przykłady
   WWW działają od razu i są oznaczone jako **DEMO**.
3. W profilu z dostępem online skopiuj `.env.example` do `.env.local`
   i uzupełnij klucze Gemini oraz Tavily tylko lokalnie. Po zmianie
   konfiguracji uruchom serwer ponownie. Sprawdź gotowość poleceniem
   `node --env-file=.env.local scripts/check-providers.mjs`.

### Scenariusz prezentacji

1. Kliknij **Graf dowodowy · dane syntetyczne**. Odczytaj werdykt, przejdź
   od wniosku do cytatu, rozwiń zapisany fragment i przetestuj eksport.
2. Kliknij **Potwierdzenie**, a potem **Brak kontekstu**. Porównaj
   przykład z dowodami i status wymagający doprecyzowania.
3. W trybie online wpisz „Polska przystąpiła do NATO 12 marca 1999 roku.”
   i użyj **Sprawdź dowody**. Śledź wyszukiwanie i audyt. Otwórz
   **Symulator Discord** w tym samym profilu przeglądarki i wyślij tę
   samą treść. Adapter symuluje wymianę wiadomości bez wysyłki na Discorda.
4. W uruchomieniu bez kluczy wyślij tę samą tezę. Panel zgłosi brak
   konfiguracji jako błąd techniczny. Kontrolowany przykład
   „Brak wystarczających dowodów” oznacza, że
   w dostępnych materiałach nie znaleziono odpowiedniej podstawy oceny.

Powyższa instrukcja opisuje plan próby; nie jest protokołem jej wykonania przez jury z czystej kopii.

## Ograniczenie kosztu wyszukiwania — 22.11.2026

Usunięto stałe mnożenie dwóch zapytań przez trzy domeny i płatne wyszukiwanie dat publikacji. Kontekst używa Basic; pobieranie dowodów nadal używa Advanced z pełnym tekstem, a zapytanie o kontrdowód pozostaje obowiązkowe. Dodatkowe zapytania uruchamiają się tylko przy niewystarczającej liczbie dokumentów lub grup wydawców. Audyt modelu, kontrola cytatów i reguły wydawania werdyktu pozostają aktywne.

Przy stawce zapisanej w aplikacji, 0,008 USD za kredyt Tavily:

| Ścieżka                                                  | Kredyty Tavily | Koszt samego Tavily |
| -------------------------------------------------------- | -------------: | ------------------: |
| Poprzednio: kontekst + sześć wyszukiwań dowodów, bez dat |             14 |           0,112 USD |
| Obecnie: kontekst Basic + dwa wyszukiwania Advanced      |              5 |           0,040 USD |
| Obecnie: powyższe + dwa dodatkowe wyszukiwania Advanced  |              9 |           0,072 USD |

Podstawowa ścieżka ma o 64,3% mniejszy koszt wyszukiwania niż poprzednia podstawowa ścieżka; usunięcie dawnych dodatkowych zapytań o daty daje dalszą oszczędność. Tabela opisuje budżet żądań przy założeniu udanych wywołań. Jedna późniejsza próba online potwierdziła podstawową ścieżkę 5 kredytów; wariantu z dodatkowymi zapytaniami nie zmierzono ponownie online. Koszt Gemini i ewentualnych innych API dochodzi osobno. Rozliczenie nadal korzysta z raportowanego zużycia dostawcy; nieznana cena lub brak danych nie stają się zerowym kosztem.

Udane, niepuste wyniki identycznego wyszukiwania można wykorzystać ponownie przez maksymalnie 5 minut w tej samej sesji. Zachowują pierwotny czas pobrania i dostają informację o ponownym użyciu. Daty publikacji są buforowane przez godzinę. Trafienie nie wydłuża ważności i nie nalicza kolejnego wywołania Tavily. Pamięć jest ograniczona do 128 wpisów i 16 MiB, z limitem 2 MiB na wpis oraz 100 sesji; może być czyszczona wcześniej. Błędy i puste wyniki nie są buforowane. Usunięcie sesji czyści bufor, a spóźniona odpowiedź trwającego żądania nie może go odtworzyć. Bufor gotowego werdyktu nadal działa osobno przez godzinę.

Testy kontrolowanych odpowiedzi sprawdzają koszt 0,040 USD Tavily dla pełnej ścieżki WWW/JSON i SSE, wywołanie kontrzapytania, warunki i limit uzupełniania źródeł, błędy dostawców, izolację i usunięcie sesji, wygasanie danych oraz zachowanie daty pobrania. Walidacja przy wdrożeniu optymalizacji: 338 testów jednostkowych/integracyjnych i 29 przeglądarkowych zaliczonych, kontrola typów i kompilacja produkcyjna poprawne. Po dodaniu kontroli wymogu dwóch typów korpusu: 339 testów jednostkowych/integracyjnych. Pominięto 6 testów integracyjnych oraz 4 przeglądarkowe wymagające jawnego włączenia usług online. Po tej walidacji wykonano jedną analizę online opisaną na początku README. Podczas aktualizacji raportów nie uruchamiano kolejnych płatnych analiz. Mniej zapytań może ograniczać kompletność wyszukiwania; wpływ na jakość wymaga osobnego pomiaru na rzeczywistych tezach.
