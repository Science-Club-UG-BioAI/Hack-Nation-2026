# Koszt 100 analiz i 100 odpowiedzi z cache

Pomiar lokalny z 21 listopada 2026 r. Faktyczna opłata za dostawców wyniosła **0 USD**. Przy licznikach zadanych w teście i publicznych cenach wartość tych 100 analiz wynosi **3,49 USD**. Każda z kolejnych 100 odpowiedzi kanału demo wykorzystała gotowy wynik.

| Pozycja | Zużycie w 100 nowych analizach | Stawka | Wartość |
| --- | ---: | ---: | ---: |
| Gemini 3.1 Flash-Lite, wejście tekstowe | 710 000 tokenów | 0,25 USD/mln | 0,1775 USD |
| Gemini 3.1 Flash-Lite, wyjście wraz z rozumowaniem | 75 000 tokenów | 1,50 USD/mln | 0,1125 USD |
| Tavily Search Advanced | 200 zapytań, 400 kredytów | 0,008 USD/kredyt | 3,20 USD |
| 100 dodatkowych dostarczeń z cache | 0 wywołań dostawców | — | 0 USD |

### Tekst do zgłoszenia

W lokalnym teście 100 nowych analiz i 100 ponownych dostarczeń do kanału demo koszt dodatkowy trafienia w cache wyniósł 0 USD. Modelowa wycena nowej analizy to 0,0349 USD przy 7100 tokenach wejścia, 750 tokenach wyjścia i dwóch wyszukiwaniach Advanced. Przy tym samym profilu **1000 nowych analiz kosztowałoby 34,90 USD**, a **1000 zapytań z 20% trafień w cache kosztowałoby 27,92 USD**. Symulowany adapter Discord nie pobiera opłaty komunikatora. Wycena obejmuje usługi analizy i wyszukiwania. Hosting, podatki, darmowe pule konta i rabaty umowne są poza kalkulacją.

### Jak powstały liczby

Z katalogu repozytorium uruchom `node scripts/load-test.mjs --benchmark`. Skrypt otwiera serwer na lokalnym porcie, wykonuje rzeczywiste procedury obu tras, zapisuje audyt w tymczasowym SQLite i wywołuje `scripts/benchmark.mjs` w wariancie domyślnym, bez grafu. Publiczny zestaw 30 przypadków przechodzi kolejno trzy razy, po czym runner wykonuje pierwszych dziesięć. Każda nowa analiza ma osobną sesję. Drugie dostarczenie korzysta z jej ciasteczka. Odstęp między przypadkami wynosi 0 ms.

Odpowiedzi HTTP dostawców są kontrolowane. Każda z trzech odpowiedzi modelu zwraca ustalone liczniki, a każda z dwóch odpowiedzi wyszukiwarki zwraca dwa kredyty. Zmierzono liczbę wywołań i dostarczeń, odczyt liczników w aplikacji i naliczenie kosztu według taryfy. Rzeczywisty rozkład długości odpowiedzi, ponowień i kosztu ruchu produkcyjnego pozostaje niezmierzony. Zestaw służy tu wyłącznie do pomiaru rozliczeń. Zapis przebiegu zawiera również koszt każdego dostarczenia. [Wyniki 100 przypadków](offline.json)

### Interpretacja danych z silnika

- `result.usage` opisuje dodatkowe zużycie tej odpowiedzi. Powtórzenie wyniku w tej samej sesji oraz dołączenie do trwającej analizy mają `cached: true`. Inna sesja uruchamia własną analizę. Pamięć wyników ma TTL pięciu minut.
- Audyt SQLite zachowuje agregat w kolumnie `checks.usage` i szczegóły prób w `payload.usageCalls`. Nieudana próba bez danych rozliczeniowych lub brak stawki daje `null` dla kosztu całej analizy. Znane liczniki poszczególnych prób pozostają dostępne. Historyczne wpisy zachowują brak danych.
- Liczba wyszukiwań obejmuje operacje wyszukiwawcze Tavily i bezpośrednich API. Odczyt tekstu odnalezionej strony i przeszukanie lokalnego katalogu nie generują kolejnej pozycji wyszukiwania. Dla kluczowanego EUvsDisinfo nie ustalono stawki. Włączenie tego adaptera dla danej analizy pozostawia koszt łączny nieustalony.
- Cennik tekstowy Standard obejmuje rozumowanie oraz zniżkę za wejście z cache dostawcy. Dla Gemini 3.1 Flash-Lite stawka za milion tokenów wejścia z cache wynosi 0,025 USD. Dla zapasowego Gemini 3.5 Flash-Lite wartości wynoszą odpowiednio 0,30 USD za wejście, 0,03 USD za wejście z cache oraz 2,50 USD za wyjście. [Cennik Gemini](https://ai.google.dev/gemini-api/docs/pricing)
- Dla Tavily przyjęto PAYGO, 0,008 USD za kredyt. Aplikacja prosi o `include_usage` i nalicza kredyty zgłoszone przez usługę. [Cennik Tavily](https://docs.tavily.com/documentation/api-credits) · [Opis odpowiedzi Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
