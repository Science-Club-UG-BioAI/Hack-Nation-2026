# P0.2 — benchmark i diagnoza odpowiedzi

Data: 21.11.2026. Wymagania: `opis.pdf`, s. 7–9. To jawny zestaw rozwojowy, nie ukryta próba jury ani niezależna ocena cytowań.

## Protokół

- `p02-before/results.json`: pełne 30 przypadków wersji po P0.1.
- `p02-after/results.json`: pełny pomiar po pierwszych poprawkach; 28/30, nadal błędy M01 i M03. Zachowany jako wynik pośredni.
- `p02-final/results.json`: trzeci pełny przebieg, po ujednoliceniu cytatów; nazwa katalogu została zachowana. Nadal 28/30: niedokończony audyt F02 oraz niespójna relacja cytatu M06.
- `p02-run4/results.json`: bieżąca wersja po ograniczonym ponowieniu niedokończonego audytu i ujednoliceniu relacji dowodu korygującego kontekst.
- Ten sam zestaw `public-v1`, modele `gemini-3.1-flash-lite` / zapasowy `gemini-3.5-flash-lite`, limit 60 s, sekwencyjne żądania i przerwa 10 s. Każda teza rozpoczyna nową sesję. Drugi kanał odczytuje tę samą migawkę; jego czas nie jest czasem inferencji.
- `provenance.json` w katalogach przebiegów zawiera HEAD oraz hashe plików źródłowych. HEAD sam nie identyfikuje niezatwierdzonych zmian. Źródła internetowe mogą zmieniać się pomiędzy próbami; porównanie nie izoluje statystycznie wpływu kodu.
- `p02-controlled/results.json`: osobne cztery przypadki sprzeczności i ataków w źródłach, z rzeczywistym modelem, ale kontrolowanym planowaniem i pobieraniem. Ich czasu nie łączymy z czasem pełnej ścieżki.
- `p02-baseline` zachowuje przerwany pomiar środowiskowy: 3 błędy połączenia, niezależnie potwierdzone `connect EACCES` w sandboxie. Przebieg nie jest kompletnym benchmarkiem jakości. Nie usunięto go ani nie zastąpiono korzystniejszymi wynikami.
- `p02-diagnostics-before` / `p02-diagnostics-after`: osobne powtórzenia do diagnozy. Nie zastępują przypadków w wynikach głównych, także gdy kończą się inaczej.

## Wykryte przyczyny i poprawki

1. **Równoległe listy cytatów.** Diagnostyka T03 i T07 odtwarzała błąd również po naprawie modelowej: ustalenia wskazywały istniejące cytaty z katalogu, których model nie powtórzył w tablicy evidence. Pierwsza poprawka usuwała nadmiarowe referencje, lecz złożone tezy nadal mogły tracić wszystkie odwołania. Końcowy resolver traktuje wskazanie cytatu w findings jako jawny wybór i dołącza jego dokładny tekst z niezmiennego katalogu. Nie wymyśla źródeł, tekstu ani relacji: bez jawnej relacji cytat ma context i nie liczy się jako bezpośrednie potwierdzenie/obalenie. Zachowuje wszystkie ustalenia i przypisania; obowiązuje łączny limit 10 różnych cytatów. Nieznane referencje, duplikaty i brak dowodów pozostają błędami. Audyt musi ocenić pełne znaczenie każdego ustalenia na podstawie wskazanych cytatów. Regresje potwierdzają, że nieadekwatna, choć istniejąca referencja nie omija audytu.
2. **Mylenie podmiotów przy braku dowodów.** W N02 model łączył projekt z promem o podobnej nazwie, a audyt błędnie traktował opis promu jako obalenie tezy o projekcie. Instrukcje oceny i audytu wymagają tożsamości obiektu oraz zdarzenia. `unresolved` z jawnym `findings=[]` nie wymusza generowania faktów dla przypadkowych wyników wyszukiwania: usuwa wybór cytatów i publikuje wyłącznie istniejący komunikat serwera o braku dowodów. Nie dotyczy to konfliktu źródeł ani ocen faktograficznych. Niepełne pobieranie nadal daje status bez werdyktu, a wyjątek dostawcy pozostaje błędem.
3. **Kontekst.** Instrukcja wymaga osobnego udowodnionego elementu prawdziwego i korekty błędnego wniosku. Dla mixed_context cytat jawnie wskazany w decisiveQuoteIds jako korekta kontekstu nie może jednocześnie potwierdzać całej mieszanej tezy. Niespójne supports jest normalizowane do context, bez zmiany tekstu; jawne contradicts pozostaje bez zmian. Audyt nadal sprawdza adekwatność tej roli. Ograniczono dodawanie faktów pobocznych, które zwiększały liczbę odwołań i ryzyko nieatomowego uzasadnienia. Nie dodano odpowiedzi ani nazw przypadków benchmarku do reguł aplikacji.
4. **Migawka między kanałami.** `unable_to_verify` wcześniej uruchamiało niezależną analizę w drugim kanale. Teraz drugi kanał może otrzymać tę samą nieudaną próbę; ponowienie w kanale, który już ją otrzymał, uruchamia świeżą analizę. Wyjątki techniczne nie są zapamiętywane. Miernik porównuje także ustalenia, uzasadnienie, ograniczenia i identyfikator, nie tylko werdykt i źródła.

5. **Niedokończony audyt.** Dodatkowe logi odróżniają status dostawcy incomplete od błędów schematu i odrzucenia znaczeniowego. Tylko incomplete przy audycie pozwala na jedno ponowienie z limitem wyjścia 3200 zamiast 1600 tokenów, jeśli pozostało co najmniej 10 s wspólnego budżetu. Nadal obowiązuje całkowite 60 s i limit etapu. Inne błędy oraz approved=false nie uruchamiają tego ponowienia. Testy obejmują ponowne incomplete, inny błąd i brak czasu. To może zwiększyć koszt nieudanej pierwszej próby; kosztu nie utożsamiamy z zerem.

## Progi

Wynik bazowy: macro-F1 0,803; pokrycie 24/24 opublikowanych ustaleń; poprawne wstrzymanie 2/3; ataki na wejściu 2/3; mediana 12,151 s (udane odpowiedzi 10,047 s); poprawne zakończenia i spójność całej próby 21/30. Osiem błędów `INVALID_MODEL_OUTPUT` i jedna odrzucona ocena pozostają w mianownikach.

Wynik pośredni: macro-F1 0,960; pokrycie 34/34; wstrzymanie i ataki po 3/3; mediana 11,726 s (udane 11,452 s); zakończenia i spójność 28/30. M01 i M03 to błędy walidacji; M03 jest regresją względem pierwszego przebiegu. Trzeci przebieg: macro-F1 0,968; pokrycie 38/38; wstrzymanie i ataki po 3/3; mediana 10,555 s; zakończenia i spójność 28/30. F02 i M06 pozostają regresjami. Bieżący przebieg p02-run4: **30/30 poprawnych wyników**, bez błędów i regresji względem bazowego przebiegu. Niezależna poprawność cytowań ≥85% i koszt 100 testów pozostają niezmierzone; nie zastępujemy ich audytem tego samego modelu ani kosztem zerowym.

| Miernik | Próg PDF | Bieżący wynik | Ocena |
|---|---|---|---|
| Macro-F1 | ≥0,75 | 1,000 | Zaliczony na jawnym zestawie |
| Pokrycie ustaleń | ≥95% | 44/44 = 100% | Zaliczona kompletność przypisań |
| Poprawność znaczeniowa cytatów | ≥85% | Nie zmierzono niezależnie | P0.3 pozostaje otwarte |
| Wstrzymanie przy braku dowodów | ≥80% | 3/3 | Zaliczony, bardzo mała próba |
| Ataki na wejściu | ≥90% | 3/3 | Zaliczony w tym zestawie |
| Mediana | ≤30 s | 11,588 s | Zaliczony; p95 16,447 s, max 17,383 s |
| Zakończenia pełnej ścieżki | 100% | 30/30 | Zaliczony lokalny zestaw, nie pełna próba jury |
| Spójność kanałów | 100% | 30/30 | Zaliczony dla tej samej migawki w sesji |
| Koszt 100 testów | Zmierzony i raportowany | Brak danych billingowych | P1.2 pozostaje otwarte |

W bieżącym przebiegu nie wystąpiła potrzeba ponawiania niedokończonego audytu. Nowa ścieżka ponowienia jest sprawdzona testami kontrolowanymi; nie przypisujemy jej przyczynowo całej poprawy online. Czas testów cache nie obniża raportowanej mediany. Surowe wyniki czterech pełnych przebiegów pozostają zachowane.

## Próby kontrolowane źródeł

Wynik: **3/4**. S01 (sprzeczne rejestry) zaliczony; S02 (sprzeczne pomiary) niezaliczony — status unable_to_verify po negatywnym audycie całej oceny, mimo pozytywnych kontroli dwóch ustaleń. Nie publikowano arbitralnego werdyktu. S03 i S04: **2/2** ataków w źródłach odparte, w obu zapisano zdarzenie filtrowania. Scenariusz C i pełny odbiór P0.2/P0.4 pozostają częściowe; tego błędu nie zastępujemy powtórzeniem.

## Pokrycie scenariuszy briefu

| Scenariusz | Próba / ograniczenie |
|---|---|
| A — fakt prosty | T01–T07, F01–F06; pełny rzeczywisty model i pobieranie |
| B — kontekst | M01–M06; element prawdziwy z błędnym wnioskiem lub okresem |
| C — sprzeczność | S01–S02; kontrolowane źródła, rzeczywisty model |
| D — brak dowodów | N01–N03; błędy techniczne nie zaliczają wstrzymania |
| E — atak w źródle | S03–S04; osobno I01–I03 atakują wejście użytkownika |
| F — multimodalność | Niewdrożona, scenariusz warunkowy; niezaliczany |
| G — kanały | Każda odpowiedź HTTP 200 sprawdzana także w adapterze tej samej sesji; błędy blokujące porównanie pozostają w mianowniku 30 |
| H — pętla informacji | Niewdrożona, scenariusz warunkowy; niezaliczany |
| I — URL/incydent | Niewdrożone dopasowanie; sam URL ma jawne `out_of_scope`, co nie zalicza scenariusza |
| J — limit OCR/reverse image | Adaptery niewdrożone; niezaliczany. Obsługę awarii używanych dostawców sprawdzają osobne testy `providers`, `gemini-transport`, `retrieval`, `api` |

Wskaźnik `endToEnd` w raporcie dotyczy dostępnych przypadków lokalnego zestawu. Nawet 30/30 nie oznacza zaliczenia wszystkich funkcji briefu lub faktycznej próby uruchomienia przez jury.

## Odtworzenie i walidacja

Uruchomić produkcyjny serwer z konfiguracją usług, następnie ustawić `BENCHMARK_URL` na jego lokalny adres i `BENCHMARK_OUTPUT` na **nowy** katalog. `npm run benchmark` zapisuje wszystkie wyniki; odmówi nadpisania istniejącego przebiegu. `npm run benchmark:evaluate -- reports/benchmark/NAZWA` przelicza jednolite mierniki, zapisuje `summary.json` i formularz przeglądu cytatów związany z hashem wyników. Nie nadpisuje surowego `results.json`.

Kontrola kodu: 206 testów jednostkowych/integracyjnych zaliczonych, 5 opt-in pominiętych; 19 przeglądarkowych zaliczonych, 4 live pominięte; typecheck i build zaliczone. Płatne próby opisane wyżej wykonano osobno. Publiczny zestaw obejmuje wąski zakres tematów; potrzebne są nowe przypadki i niezależny przegląd w P0.3/P0.4.

## Czy zmieniać dostawcę?

Główny przebieg bazowy nie zawierał błędów dostępności Gemini po przywróceniu dostępu do sieci. Większość niepowodzeń dotyczyła kontraktu dowodów i audytu. Zmiana dostawcy nie usuwa błędów koordynacji kanałów ani walidatora. Jednocześnie model potrafił błędnie zinterpretować niepowiązane materiały; audyt tym samym modelem nie jest niezależną gwarancją.

Końcowy pomiar na tym samym dostawcy poprawił główny zestaw z 21/30 do 30/30. Odrzucona ocena S02 nadal pokazuje potrzebę niezależnej walidacji i ewentualnego porównania modeli. Ewentualny wybór innego modelu/dostawcy wymaga próby porównawczej na tych samych przypadkach i dowodach, z oceną trafności, błędów formatu, czasu i kosztu. Ten pomiar nie jest takim porównaniem. Obecny fallback to drugi model Gemini, a nie drugi dostawca.
