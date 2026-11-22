# Lokalny pomiar obciążenia — 22.11.2026

[Surowe wyniki](offline-optimized-2026-11-22/local.json), [hash kodu i katalogu](offline-optimized-2026-11-22/provenance.json), [przenośna migawka](../../data/measurements/status-2026-11-22.json).

**To pomiar kontrolowanych odpowiedzi HTTP, bez rzeczywistych wywołań dostawców.** Opóźnienie każdego podstawionego połączenia wynosi 20 ms. Środowisko: Windows, Node.js v24.8.0, jeden proces. Równolegle wykonywano kontrolowany test rozliczeń 100 analiz; czasy są obserwacjami na tym komputerze, nie izolowanym benchmarkiem przepustowości.

| Żądania na falę | Żądania łącznie | HTTP 200 | HTTP 429 | Mediana / p95 przyjętych | Gemini / Tavily, wywołania symulowane |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1 | 5 | 5 | 0 | 159,6 / 209,7 ms | 15 / 15 |
| 3 | 15 | 15 | 0 | 171,7 / 173,9 ms | 45 / 45 |
| 12 | 60 | 15 | 45 | 187,7 / 197,7 ms | 45 / 45 |

Pięć fal dla każdego wariantu; następna zaczyna się po poprzedniej. Przy 12 klientach limiter przyjmuje 3 analizy, pozostałe odrzuca. Mediana/p95 wszystkich 60 odpowiedzi to 52,7/196,8 ms, a samych odmów 49,9/57,1 ms. Szybkie HTTP 429 nie są szybką weryfikacją. Łącznie wykonano 80 żądań: 35 przyjęć i 45 odmów, bez innych błędów. Opłaty API wyniosły 0 USD.

Uruchomienie: `node scripts/load-test.mjs`. Wszystkie żądania do dostawców są podstawiane; nie trzeba kluczy. Wyniki są zapisywane w nowym katalogu z datą, opcjonalnie wskazanym przez `MEASUREMENT_OUTPUT`. Istniejący plik provenance blokuje nadpisanie. Ten test nie mierzy limitów kont Gemini/Tavily, dostępności stron, ruchu wieloinstancyjnego ani 1000 równoczesnych użytkowników.

Lokalny serwer ma domyślnie limit 3 równoległych analiz, 100 prób online na proces i 10 prób/10 minut na sesję. Test ma własny limit 150 prób. Nie ma kolejki. W produkcji czas zależy od usług zewnętrznych; jedna zmierzona analiza po optymalizacji trwała 16,914 s, a nie około 0,2 s.

Historyczny [local.json](local.json) z 21.11.2026 pozostaje niezmieniony: przy 12 klientach mediana/p95 przyjęć 161,3/174,0 ms i po dwa zapytania Tavily na analizę. Nie opisuje obecnego schematu wyszukiwania.

### Informacje dla ścieżki zgłoszeniowej

**Powiadomienia.** Administrator ustawia `ALERT_WEBHOOK_URL` na adres HTTPS. Pierwsza analiza zawierająca rozpoznaną frazę o bezpośrednim zagrożeniu, np. ewakuacji, alarmie chemicznym lub skażeniu wody, uruchamia regułę wysokiego ryzyka. Druga reguła obejmuje ponowienie w tej samej sesji tej samej tezy z tą samą datą, gdy oba wyniki to „Brak wystarczających dowodów” bez źródeł. Pojedyncze przekazanie tej samej analizy do drugiego kanału nie liczy się jako kolejne pytanie. Porównanie uwzględnia maskowanie, wielkość liter, odstępy i końcową interpunkcję.

Odbiorca dostaje wyłącznie identyfikator żądania i kod przyczyny. Audyt sesji zawiera stan `delivered`, `failed` lub `unconfigured` i ewentualny kod HTTP. Próba trwa maksymalnie 1,5 s, wcześniej może ją przerwać termin samego żądania. Błąd dostarczenia pozostawia obliczony werdykt. W testach odbiorca był podmieniony lokalnie.

**Prywatność.** Przed wysłaniem tezy do dostawców i przy zapisie audytu silnik maskuje również polskie dowody osobiste i rozpoznane zagraniczne IBAN. Dla serii dowodu sprawdza format i sumę kontrolną, a przy jednoznacznej etykiecie maskuje również błędną cyfrę kontrolną. Dla IBAN stosuje długość właściwą dla kraju i kontrolę modulo 97. Testy obejmują tekst bez odstępów, zapis grupowany, sąsiednie daty i liczby oraz kody podobne do identyfikatorów. [Rejestr formatów IBAN SWIFT](https://www.swift.com/standards/data-standards/iban-international-bank-account-number)

**Źródła.** Katalog zawiera 129 pozycji w 13 grupach domen, wyłącznie typu official. Wymóg dwóch typów pozostaje niespełniony. Dla trzech znamy datę publikacji, dla jednej datę aktualizacji, a dla dwóch okres opisanego zdarzenia. Brakujące daty mają wartość `null`. Przykładowo KPRM opublikowała 12 marca 2024 r. komunikat o przystąpieniu Polski do NATO 12 marca 1999 r. Strona NASA podaje osobno publikację w 2010 r. i aktualizację w 2023 r. Po przebudowie katalogu polecenie `node scripts/check-corpus.mjs --enrich` nanosi zweryfikowane metadane. [Komunikat KPRM](https://www.gov.pl/web/premier/25-lat-temu-polska-przystapila-do-nato) · [Komunikat NATO](https://www.nato.int/en/news-and-events/articles/news/2024/03/14/secretary-general-thanks-president-duda-for-polands-contributions-following-25-years-of-nato-membership) · [Karta NASA SVS](https://svs.gsfc.nasa.gov/10618)

W wyniku `publisherIsDomain` wskazuje nazwę zastępczą. Siła podstawy podaje liczbę cytowanych źródeł i grup wydawców. Serwisy gov.pl liczą się jako jedna grupa. Ostrzeżenie czasowe wskazuje znaną niezgodność okresu albo materiał starszy niż rok dla pytania o aktualny stan. Punktem odniesienia jest data tezy, a przy jej braku dzień sprawdzenia. Dla wielu tez historycznych wiek publikacji nie wpływa na jej przydatność.
