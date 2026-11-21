# Obciążenie lokalnego silnika

Przy limicie trzech jednoczesnych analiz pięć fal po 12 żądań dało 15 odpowiedzi HTTP 200 i 45 odpowiedzi HTTP 429. **Wśród przyjętych żądań tej próby mediana wyniosła 157,8 ms, a p95 wyniósł 173,3 ms.** Osobne czasy przyjęć i odmów są istotne, bo szybka odmowa obniża medianę całego ruchu.

| Żądania na falę | Łącznie | HTTP 200 | HTTP 429 | Odsetek błędów | Mediana / p95 wszystkich (ms) | Mediana / p95 HTTP 200 (ms) | Gemini / Tavily |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 5 | 5 | 0 | 0% | 125,5 / 181,7 | 125,5 / 181,7 | 15 / 10 |
| 3 | 15 | 15 | 0 | 0% | 142,0 / 150,6 | 142,0 / 150,6 | 45 / 30 |
| 12 | 60 | 15 | 45 | 75% | 54,8 / 158,5 | 157,8 / 173,3 | 45 / 30 |

Test z 21 listopada 2026 r. działał na jednym procesie Node.js v24.8.0. Uruchamia się go poleceniem `node scripts/load-test.mjs` z katalogu repozytorium. Skrypt używa lokalnego HTTP, rzeczywistych procedur tras i osobnej bazy SQLite. Każde żądanie ma nową sesję. Następna fala czeka na zakończenie wszystkich odpowiedzi poprzedniej. Każde podmienione połączenie z dostawcą ma opóźnienie 20 ms. Mediana i p95 to obserwacje o rangach zaokrąglonych w górę. Próba z jednym klientem ma pięć obserwacji. Wszystkie błędy w pomiarze to odmowy lokalnego limitera. [Surowe metryki](local.json)

### Limity wdrożenia i usług

- Jeden proces domyślnie dopuszcza trzy równoczesne nowe analizy, dziesięć nowych analiz sesji w dziesięć minut i sto nowych analiz od uruchomienia. Osiągnięcie limitu powoduje HTTP 429 z `Retry-After: 60`. Limit całkowity trwa do restartu procesu, a czas resetu limitu sesji zależy od początku jej okna. Aplikacja nie przechowuje kolejki oczekujących. Pomiar dotyczy maksymalnie 12 równoczesnych żądań.
- Gemini stosuje limity dla projektu zależne od modelu i poziomu konta. Znaczenie mają m.in. żądania na minutę, tokeny na minutę i żądania na dzień. Aktywne limity danego projektu pokazuje AI Studio. W tym pomiarze nie obciążano konta dostawcy. [Limity Gemini](https://ai.google.dev/gemini-api/docs/rate-limits)
- Tavily podaje dla Search 100 żądań/min na planie Researcher i 1000/min po włączeniu PAYGO. Klucze w tej samej organizacji współdzielą limit. Analiza w badanym scenariuszu uruchamia dwa wyszukiwania. [Limity Tavily](https://docs.tavily.com/documentation/rate-limits)
- Adapter arXiv w tym projekcie szereguje połączenia z przerwą co najmniej trzech sekund między startami. Publiczne API i witryny korpusu mają własne opóźnienia i mogą ograniczyć dostęp. W tej próbie nie zmierzono ich przepustowości.

### Informacje dla ścieżki zgłoszeniowej

**Powiadomienia.** Administrator ustawia `ALERT_WEBHOOK_URL` na adres HTTPS. Pierwsza analiza zawierająca rozpoznaną frazę o bezpośrednim zagrożeniu, np. ewakuacji, alarmie chemicznym lub skażeniu wody, uruchamia regułę wysokiego ryzyka. Druga reguła obejmuje ponowienie w tej samej sesji tej samej tezy z tą samą datą, gdy oba wyniki to „Brak wystarczających dowodów” bez źródeł. Pojedyncze przekazanie tej samej analizy do drugiego kanału nie liczy się jako kolejne pytanie. Porównanie uwzględnia maskowanie, wielkość liter, odstępy i końcową interpunkcję.

Odbiorca dostaje wyłącznie identyfikator żądania i kod przyczyny. Audyt sesji zawiera stan `delivered`, `failed` lub `unconfigured` i ewentualny kod HTTP. Próba trwa maksymalnie 1,5 s, wcześniej może ją przerwać termin samego żądania. Błąd dostarczenia pozostawia obliczony werdykt. W testach odbiorca był podmieniony lokalnie.

**Prywatność.** Przed wysłaniem tezy do dostawców i przy zapisie audytu silnik maskuje również polskie dowody osobiste i rozpoznane zagraniczne IBAN. Dla serii dowodu sprawdza format i sumę kontrolną, a przy jednoznacznej etykiecie maskuje również błędną cyfrę kontrolną. Dla IBAN stosuje długość właściwą dla kraju i kontrolę modulo 97. Testy obejmują tekst bez odstępów, zapis grupowany, sąsiednie daty i liczby oraz kody podobne do identyfikatorów. [Rejestr formatów IBAN SWIFT](https://www.swift.com/standards/data-standards/iban-international-bank-account-number)

**Źródła.** Katalog zawiera 130 pozycji w 10 konserwatywnie grupowanych domenach. Dla trzech znamy datę publikacji, dla jednej datę aktualizacji, a dla dwóch okres opisanego zdarzenia. Brakujące daty mają wartość `null`. Przykładowo KPRM opublikowała 12 marca 2024 r. komunikat o przystąpieniu Polski do NATO 12 marca 1999 r. Strona NASA podaje osobno publikację w 2010 r. i aktualizację w 2023 r. Po przebudowie katalogu polecenie `node scripts/check-corpus.mjs --enrich` nanosi zweryfikowane metadane. [Komunikat KPRM](https://www.gov.pl/web/premier/25-lat-temu-polska-przystapila-do-nato) · [Komunikat NATO](https://www.nato.int/en/news-and-events/articles/news/2024/03/14/secretary-general-thanks-president-duda-for-polands-contributions-following-25-years-of-nato-membership) · [Karta NASA SVS](https://svs.gsfc.nasa.gov/10618)

W wyniku `publisherIsDomain` wskazuje nazwę zastępczą. Siła podstawy podaje liczbę cytowanych źródeł i grup wydawców. Serwisy gov.pl liczą się jako jedna grupa. Ostrzeżenie czasowe wskazuje znaną niezgodność okresu albo materiał starszy niż rok dla pytania o aktualny stan. Punktem odniesienia jest data tezy, a przy jej braku dzień sprawdzenia. Dla wielu tez historycznych wiek publikacji nie wpływa na jej przydatność.
