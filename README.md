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

Instrukcja publicznego wdrożenia na Ubuntu z Nginx i certyfikatem Let's Encrypt dla `kitcheck.anovei.pl` jest w [DEPLOY.md](DEPLOY.md).

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

## Źródła, licencje i aktualizacja katalogu

[Katalog korpusu](data/corpus/catalog.json) zawiera 132 rekordy z 14 grup domen. Obejmuje źródła urzędowe i fact-checkingowe. Zapisujemy metadane, m.in. adres, tytuł, wydawcę i dostępne daty. Katalog nie archiwizuje pełnych tekstów ani obrazów. Silnik pobiera tekst wybranych stron podczas analizy, a w raporcie pokazuje zweryfikowane cytaty z odnośnikami. Przy potwierdzonej licencji lub zgodzie wydawcy `license` podaje jej nazwę i zakres, a `licenseUrl` prowadzi do warunków. Pozostałe wpisy mają adnotację o przechowywaniu metadanych i `licenseUrl: null`.

### Licencje i warunki ponownego wykorzystania

Przegląd z 22 listopada 2026 r. obejmuje polityki wydawców i dostępne oznaczenia materiałów. Licencję stosujemy w zakresie wskazanym przez wydawcę. Przy rozbieżności sprawdzamy oznaczenie konkretnej publikacji lub zbioru oraz prawa do treści osób trzecich. Cztery anglojęzyczne strony Gov.pl z katalogu wskazują w swoich stopkach CC BY 3.0 PL, a dla informacji sektora publicznego na stronie PAA obowiązuje nota tej agencji. [Przykład anglojęzycznej stopki](https://www.gov.pl/web/un/poland-in-the-un) · [Nota PAA](https://www.gov.pl/web/paa/ponowne-wykorzystanie-informacji-publicznej)

| Źródło                                          | Ustalenia                                                                                                                                                                                                                                                                                                                                        | Dokument wydawcy                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `www.gov.pl`                                    | Teksty Portalu Gov.pl są objęte CC BY-SA 4.0, a materiały audiowizualne co do zasady CC BY-NC-ND 4.0. Portal osobno wskazuje materiały urzędowe i utwory osób trzecich.                                                                                                                                                                          | [Prawa autorskie Gov.pl](https://www.gov.pl/web/gov/prawa-autorskie)                                                                                                                                                                                                                                                                                                                                                      |
| Senat, ULC, urzędy morskie w Gdyni i Szczecinie | Własne zasady ponownego wykorzystania. Senat i ULC wymagają m.in. wskazania źródła. Warunki dla urzędów morskich podają ich strony.                                                                                                                                                                                                              | [Senat](https://www.senat.gov.pl/ponowne-wykorzystywanie-informacji-sektora-publicznego/), [ULC](https://ulc.gov.pl/publikacje/wiadomosci/informacja-dotyczaca-korzystania-z-materialow-publikowanych-na-stronie-internetowej-ulc), [Gdynia](https://www.umgdy.gov.pl/prawne-podstawy-dzialania/ponowne-wykorzystywanie-informacji-sektora-publicznego/), [Szczecin](https://ums.gov.pl/ponowne-wykorzystanie-informacji) |
| Zintegrowana Platforma Edukacyjna               | Warunki zależą od materiału i jego elementów. W lekcjach z katalogu występują m.in. elementy oznaczone CC BY 3.0, CC BY-SA 3.0 i CC BY-ND 2.0.                                                                                                                                                                                                   | [Regulamin ZPE](https://zpe.gov.pl/regulamin), [Przykład CC BY i CC BY-SA](https://zpe.gov.pl/a/przeczytaj/DW5UPsJ7F), [Przykład CC BY-ND](https://zpe.gov.pl/watek/LP7H11XUNM/4/a/polska-polityka-zagraniczna-xxi-wieku---droga-do-nato-i-unii-europejskiej/DERNLCXJB)                                                                                                                                                   |
| Pozostałe serwisy w grupie `gov.pl`             | Otwartej licencji dla wpisów BBN, IPN, NAWA, Odyseusza, UTK, SAR i serwisów mapowych GDDKiA, GIOŚ oraz PAA nie potwierdzono. BBN zastrzega materiały oznaczone jako PAP, a Study.gov.pl zastrzega prawa. PAA osobno podaje CC BY 3.0 PL dla informacji sektora publicznego na swojej stronie oraz warunki właściwe dla zbiorów w portalu danych. | [BBN](https://www.bbn.gov.pl/pl/kontakt/kontakt/6061%2CBiuro-Bezpieczenstwa-Narodowego.pdf), [Study.gov.pl](https://study.gov.pl/must-know-facts-about-poland), [GIOŚ](https://powietrze.gios.gov.pl/pjp/content/api?theme=default), [PAA](https://www.gov.pl/web/paa/ponowne-wykorzystanie-informacji-publicznej)                                                                                                        |
| `policja.pl` i Policja Mazowiecka               | Wydawcy dopuszczają korzystanie z materiałów na zasadach podanych w nocie, proszą o wskazanie źródła i zastrzegają prawa osób trzecich.                                                                                                                                                                                                          | [Policja.pl](https://www.policja.pl/pol/page/46616,Prawa-autorskie.html), [Policja Mazowiecka](https://mazowiecka.policja.gov.pl/ra/wolnytekst/10,Prawa-autorskie.html)                                                                                                                                                                                                                                                   |
| `nbp.pl`                                        | Regulamin pozwala kopiować materiały do użytku osobistego lub służbowego. Przy wykorzystaniu materiałów wymaga wskazania źródła z linkiem do NBP.                                                                                                                                                                                                | [Regulamin NBP](https://static.nbp.pl/dokumenty/regulaminy/regulamin_nbppl.pdf)                                                                                                                                                                                                                                                                                                                                           |
| `cert.pl`                                       | Komunikaty bezpieczeństwa w moje.cert.pl są objęte CC BY-SA 4.0, o ile w danym materiale nie wskazano inaczej.                                                                                                                                                                                                                                   | [Komunikaty CERT Polska](https://moje.cert.pl/komunikaty/)                                                                                                                                                                                                                                                                                                                                                                |
| `demagog.org.pl`                                | Własna licencja dopuszcza użytek niekomercyjny z oznaczeniem autorstwa i źródła, ochroną integralności oraz zachowaniem warunków dalszego udostępniania. Odrębna licencja wskazana przy materiale ma pierwszeństwo.                                                                                                                              | [Warunki licencji Demagoga](https://demagog.org.pl/zasady-udostepniania-tresci/)                                                                                                                                                                                                                                                                                                                                          |
| `europa.eu`                                     | Treści należące do UE na portalu UE i stronach Komisji są co do zasady objęte CC BY 4.0. Publikacja „EU & ME” zezwala na ponowne użycie ze wskazaniem źródła. Obowiązują odrębne oznaczenia i prawa osób trzecich.                                                                                                                               | [Portal UE](https://european-union.europa.eu/legal-notice_pl), [Komisja Europejska](https://commission.europa.eu/legal-notice_en), [EU & ME](https://op.europa.eu/webpub/com/eu-and-me/en/)                                                                                                                                                                                                                               |
| `nato.int`                                      | Warunki NATO obejmują wskazanie źródła, ograniczenia sprzedaży, reklamy i promocji oraz zasady użycia artykułów i materiałów wizualnych. Odrębnej otwartej licencji dla strony SHAPE nie potwierdzono.                                                                                                                                           | [Warunki NATO](https://www.nato.int/en/about-us/official-texts-and-resources/use-of-nato-content-and-brand)                                                                                                                                                                                                                                                                                                               |
| `un.org`                                        | Ogólne warunki ONZ zezwalają na pobieranie i kopiowanie do osobistego użytku niekomercyjnego, bez prawa do dalszej dystrybucji i tworzenia opracowań. Dla dokumentów i wyspecjalizowanych serwisów sprawdzamy osobne oznaczenia.                                                                                                                 | [Warunki ONZ](https://www.un.org/en/about-us/terms-of-use/)                                                                                                                                                                                                                                                                                                                                                               |
| `esa.int`                                       | ESA zezwala na kopiowanie materiałów z głównego portalu do osobistego użytku niekomercyjnego. Obrazy i filmy mają odrębne warunki. Nie potwierdzono otwartej licencji dla wpisu NAVISP ani dla referatu konferencyjnego z katalogu.                                                                                                              | [Warunki portalu ESA](https://www.esa.int/articles/about-us/directorates/resources-and-services/terms-and-conditions), [Warunki obrazów i filmów](https://photolibrary.esa.int/terms-and-conditions/)                                                                                                                                                                                                                     |
| `nasa.gov`                                      | NASA podaje, że jej własne materiały medialne co do zasady nie są chronione prawem autorskim w USA, a SVS wskazuje domenę publiczną, o ile przy materiale nie podano inaczej. Obowiązują wyjątki dla treści osób trzecich i oznaczeń NASA.                                                                                                       | [NASA Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), [NASA SVS](https://svs.gsfc.nasa.gov//help/)                                                                                                                                                                                                                                                                                     |
| `worldbank.org`                                 | Własne otwarte zbiory danych Banku i dane Data360 co do zasady podlegają CC BY 4.0 z dodatkowymi warunkami. Materiały witryny podlegają warunkom Banku, a publikacje repozytorium mają indywidualne licencje. Licencji konkretnych publikacji z katalogu nie potwierdzono.                                                                       | [Warunki Banku](https://www.worldbank.org/ext/en/legal/terms-conditions), [Data Catalog](https://datacatalog.worldbank.org/public-licenses), [Data360](https://data360.worldbank.org/en/about), [Open Knowledge Repository](https://www.worldbank.org/ext/en/legal/terms-conditions/open-knowledge-repository)                                                                                                            |
| `imgw.pl`                                       | Regulamin danych publicznych IMGW-PIB obejmuje udostępniane dane, w tym dane wskazane w serwisie Meteo. Wymaga wskazania źródła i oznaczenia przetworzenia. Ogólnej licencji na zawartość witryn Meteo, Hydro i Bałtyk nie potwierdzono.                                                                                                         | [Regulamin danych IMGW-PIB](https://dane.imgw.pl/regulations)                                                                                                                                                                                                                                                                                                                                                             |
| `portalpasazera.pl`, `kgsok.pl`                 | Regulamin Portalu Pasażera przewiduje wykorzystanie danych w innych serwisach i aplikacjach przez bezpośredni odnośnik. Dla serwisu SOK znaleziono notę copyright, bez potwierdzonej otwartej licencji. PKP PLK publikuje osobne warunki dla informacji sektora publicznego.                                                                     | [Regulamin Portalu Pasażera](https://portalpasazera.pl/Content/terms/PDP_Regulamin_WCAG2.pdf), [SOK](https://kgsok.pl/), [BIP PKP PLK](https://bip.plk-sa.pl/ponowne-wykorzystywanie)                                                                                                                                                                                                                                     |

### Kwalifikacja źródeł

- Preferujemy źródła pierwotne właściwe dla tematu i publikacje organizacji fact-checkingowych. [Polityka domen](src/core/source-policy.ts) określa, które adresy korpusu aplikacja może pobrać.
- [Skrypt budowy](scripts/build-corpus.mjs) wyszukuje kandydatów przez Tavily w zadanych domenach. Przyjmuje adresy HTTPS zwracające HTML bez przekierowania, odrzuca duplikaty, pliki PDF i strony blokad. Przy ręcznym dodawaniu sprawdzamy wydawcę, związek z tematyką, dostępność i warunki konkretnego materiału. Nieznanej daty publikacji nie zastępujemy datą pobrania.
- Przy przeglądzie usuwamy lub zastępujemy pozycje trwale niedostępne, przeniesione poza listę dopuszczonych domen albo nieprzydatne tematycznie. Warunki pobierania i użycia treści oceniamy ręcznie przy kwalifikacji i aktualizacji. Aplikacja egzekwuje listę domen i wymagania techniczne dotyczące pobierania.

### Aktualizacja katalogu

Katalog w repozytorium aktualizujemy ręcznie po zmianie adresu, warunków wydawcy lub zakresu tematycznego. Przy pełnym odświeżeniu `npm run corpus:build` wyszukuje kandydatów, zapisuje [raport pobrania](data/corpus/collection-report.json) i może nadpisać katalog. Przed przyjęciem wyniku porównujemy go z dotychczasową wersją, sprawdzamy zmienione wpisy i zachowujemy zweryfikowane metadane. `npm run corpus:check` sprawdza m.in. duplikaty, kompletność metadanych oraz progi 100 rekordów, 10 grup domen i dwóch typów źródeł.

Przy nowej analizie silnik wybiera do trzech pasujących rekordów i pobiera dostępny tekst z adresu wydawcy. Daty `builtAt` i `retrievedAt` określają odpowiednio czas zbudowania katalogu i pozyskania rekordu. Data publikacji lub aktualizacji materiału ma własne pole, gdy została ustalona. [Pobieranie w czasie analizy](src/server/corpus.ts)

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
