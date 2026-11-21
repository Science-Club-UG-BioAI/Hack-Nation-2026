# KITCHECK

Plan domknięcia MVP na podstawie briefu **PRAWDOWID** (MSZ, Hack-Nation 2026, pliku opis.pdf przekazanego zespołowi). Stan po audycie: **21.11.2026**. Implementacja znajduje się w tym repozytorium i używa nazwy Prawdowid.

Cel: narzędzie, które pozwala obywatelowi sprawdzić doniesienie tak łatwo, jak wysłać wiadomość, z jawnymi źródłami, oceną siły dowodów i uczciwym wstrzymaniem się od rozstrzygnięcia.

> **Stan przed zgłoszeniem.** W kodzie są polski interfejs WWW, automatyczny adapter Discord demo, wspólny werdykt z cytatami, graf dowodowy oraz opcjonalne wyszukiwanie EUvsDisinfo. Do odbioru pozostają pomiar aktualnej ścieżki WWW, niezależna ocena cytatów, przypadek sprzecznych źródeł S02 i próba jury z czystej kopii.
>
> Jury ocenia funkcje premiowane po spełnieniu warunków podstawowych. Prototyp ma samodzielnie przejść od zgłoszenia do zapisania i dostarczenia odpowiedzi, pokazać rzeczywiste źródła i wstrzymać werdykt przy braku dowodów. Brief dopuszcza WWW z automatycznym adapterem demonstracyjnym.

## Jak czytać ten plan

- **GOTOWE**: mechanizm istnieje w opisanym zakresie; nie oznacza automatycznie spełnienia wszystkich progów jury ani gotowości produkcyjnej.
- **CZĘŚCIOWE**: jest implementacja lub dokumentacja, ale brakuje elementów albo wiarygodnego potwierdzenia jakości.
- **BRAK**: nie znaleziono implementacji lub wymaganego artefaktu w sprawdzonym workspace.
- **P0**: blokery rzetelnej deklaracji jakości i warunków podstawowych.
- **P1**: pozostałe wymagania do domknięcia przed zgłoszeniem MVP; nie są opcjonalne tylko dlatego, że występują po P0.
- **P2**: rozszerzenia po odbiorze MVP. Nie uruchamiamy ich kosztem P0/P1.

Checkboxy poniżej służą do odbioru pozostałych prac. Stan istniejących funkcji przedstawiają tabele. Przegląd statyczny z 21.11.2026 obejmuje kod do `f3d17b8`, brief i zapisane raporty. Przytoczone wyniki pochodzą z wcześniejszych przebiegów. Po zmianie kodu należy aktualizować dowód i status, nie tylko odhaczać zadanie.

## Zakres MVP i granice deklaracji

**Przyjęty zakres:** pojedyncza tekstowa teza 20–500 znaków, opcjonalna data wypowiedzi, odpowiedź po polsku, responsywny WWW i automatyczny adapter Discord demo korzystający ze wspólnego silnika. Adapter zastępuje transport; nie jest aktywnym botem Discord.

Brief mówi „tekst lub adres URL” oraz „jednego lub kilku twierdzeń” (s. 2). Przyjmujemy tekst i jedną tezę jako zakres minimalny. Graf dowodowy może wydzielić do sześciu twierdzeń atomowych z podanego tekstu. Pobieranie artykułu z URL i weryfikacja całej jego treści pozostają rozszerzeniami. Sam adres HTTP(S) o długości 20–500 znaków prowadzi w silniku do `out_of_scope`. Poza tym zakresem długości żądanie odpada już przy walidacji wejścia.

Obecny benchmark obejmuje głównie historię członkostwa Polski w UE/NATO i walutę oraz przypadki kontrolne. Nie dowodzi jakości dla dowolnych bieżących wydarzeń, ostrzeżeń ani tematów wysokiego ryzyka. Silnik korzysta także z otwartego wyszukiwania; należy opisać osobno zakres obsługi i zakres zwalidowany.

Brief wymaga oszacowania kosztu **1000 zapytań** i zachowania przy większym ruchu (s. 7). Nie wymaga obsługi **1000 jednoczesnych użytkowników**, konkretnej bazy, kolejki, Dockera ani Kubernetes. Cel czasowy to **mediana ≤30 s**, nie twardy limit każdej odpowiedzi.

## Kolejność prac pod MVP

| Priorytet | Praca i stan | Kryterium odbioru |
|---|---|---|
| P0.1 | **GOTOWE — mechanizm i pomiar strukturalny**, 44/44 ustaleń w P0.2 | Każde opublikowane ustalenie ma przypisany dowód; znaczenie i atomowość niezależnie ocenia P0.3. |
| P0.2 | **CZĘŚCIOWE — 30/30 przed integracją grafu i EUvsDisinfo, kontrolowane źródła 3/4. Aktualna wersja wymaga pomiaru** | Główne progi zaliczone: macro-F1 1,000, pokrycie 44/44, wstrzymanie 3/3, mediana 11,588 s, kanały 30/30. Pozostaje odrzucony audyt sprzecznych pomiarów S02. Niezależna poprawność cytatów jest P0.3, koszt P1.2; pełna próba jury P0.4. |
| P0.3 | **BRAK** — niezależna ocena znaczeniowa cytatów | Wypełniona ocena powiązana z konkretnym przebiegiem i jego hashem, metoda/recenzent, wynik ≥85%; audyt tym samym modelem nie zastępuje oceny referencyjnej. |
| P0.4 | **CZĘŚCIOWE** — potwierdzić pełną ścieżkę i odporność | Próba jury działa bez ingerencji; jawnie oznaczone demo nie zastępuje analizy online. Testy ataków na wejściu i w źródłach sprawdzają zachowanie oraz zapis zdarzeń. |
| P1.1 | **CZĘŚCIOWE** — aktualność, wydawcy i siła podstawy | Daty publikacji mają podstawę albo jawny brak; czas zdarzenia jest porównany z tezą; archiwalny materiał ma ostrzeżenie tam, gdzie to istotne. UI wyjaśnia adekwatność, aktualność, rozbieżności i niezależność dowodów. |
| P1.2 | **BRAK** — tokeny, koszt i pomiar większego ruchu | Zapis użycia i kosztu, zmierzony koszt 100 testów, szacunek 1000 zapytań oraz koszt kanału; raport lokalnego obciążenia i zachowania limitów, bez obietnicy 1000 użytkowników równocześnie. |
| P1.3 | **CZĘŚCIOWE** — prywatność, dostawcy, licencje, dostępność | Udokumentowane ograniczenia maskowania, zasady danych u dostawców, miejsce przetwarzania, warunki źródeł, migracja dostawcy; przegląd klawiatury, fokusu, etykiet i kontrastu. |
| P1.4 | **BRAK** — powiadomienie wskazanego odbiorcy | Dla spraw wysokiego ryzyka oraz powtarzających się pytań bez źródeł odbiorca wskazany przez administratora dostaje powiadomienie. Pełna obsługa spraw moderatora pozostaje w P2. |
| P1.5 | **CZĘŚCIOWE / BRAK** — pakiet zgłoszeniowy | Odtwarzalny aktualny raport, instrukcja jury, opis ≤4000 znaków, PDF ≤12 slajdów, film ≤3 min i lista ryzyk; przegląd plików przeznaczonych do publikacji. |
| P2 | **BRAK / CZĘŚCIOWE** — dodatki i skalowanie | Wybór dopiero po odbiorze P0/P1 na podstawie korzyści dla użytkownika i wyników pomiarów. |

**Kolejność odbioru.** Najpierw wyjaśnić S02 i uzupełnić sposób pomiaru o żądanie wysyłane przez WWW. Następnie zapisać wersję kodu, konfigurację źródeł i zestaw przypadków, wykonać pomiar, a jego wynik przekazać do niezależnego przeglądu cytatów. Zachować także niepełne przebiegi i przyczyny przerwania.


### Aktualizacja implementacji P0.1 — 21.11.2026

Wdrożono `findings[{id,text,evidenceIds}]`, identyfikatory cytatów i kontrakt `findings-v1`. Uzasadnienie jest składane z ustaleń i odnośników; swobodna proza modelu w uzasadnieniu, ograniczeniach i opisie cytatu nie jest publikowana. Audyt musi objąć każde ustalenie i ocenić jego uzasadnienie oraz atomowość. Mechanizm działa po naprawie/uzupełnianiu, w WWW, adapterze i eksporcie sesji. Brak akceptacji oznacza status bez werdyktu i bez niezatwierdzonych ustaleń.

Dowody: `src/core/quotations.ts`, `src/core/contracts.ts`, `src/core/benchmark.ts`, `src/server/verify.ts`; testy `quotations`, `pipeline`, `benchmark`, `api`, `channels`, `privacy`. Kontrola typów, kompilacja produkcyjna, 191 testów jednostkowych/integracyjnych i 19 przeglądarkowych przeszły; pominięto 5 testów opt-in oraz 4 testy przeglądarkowe live. Nie wykonano nowego benchmarku online. Samo istnienie poprawnych odwołań i audyt modelowy nie potwierdzają prawdziwości ani jakości 85% — P0.2/P0.3 pozostają otwarte. Zero ustaleń nie daje 100% pokrycia; błędy nadal obniżają odrębne mierniki trafności i end-to-end. Historycznych raportów nie zmieniono.

### Aktualizacja P0.2 — 21.11.2026

Zapisany pomiar `p02-run4`: **30/30**, macro-F1 **1,000**, pokrycie **44/44**, wstrzymanie **3/3**, ataki wejścia **3/3**, spójność kanałów **30/30**, mediana **11,588 s**. Modele pozostały bez zmian. Zachowano pomiar bazowy 21/30 i oba przebiegi pośrednie po 28/30, wraz z błędami i regresjami. Nie wybrano najlepszych odpowiedzi z różnych przebiegów.

Naprawiono podwójne wybieranie cytatów (referencja w ustaleniu jest jawnym wyborem istniejącego fragmentu), brak dowodów przy niepowiązanych wynikach, rolę korekty kontekstu, przekazywanie nieudanej próby między kanałami oraz ograniczone ponowienie niedokończonego audytu. Nie dodano odpowiedzi benchmarku do aplikacji. Negatywny audyt nadal blokuje publikację. Dla tamtej wersji odnotowano zaliczenie 206 testów jednostkowych/integracyjnych, 19 przeglądarkowych, kontroli typów i kompilacji.

Dowody: [raport P0.2](reports/benchmark/p02-report.md), [mierniki i progi P0.2](reports/benchmark/p02-run4/summary.json), [surowe wyniki](reports/benchmark/p02-run4/results.json). **Kontrolowane źródła: 3/4**; S02 (sprzeczne pomiary) odrzucone przez audyt, bez publikacji werdyktu. Ataki w źródłach 2/2 odparte i odnotowane. Dlatego P0.2/P0.4 pozostają częściowe. Niezależny przegląd ≥85%, koszt i próba jury pozostają otwarte w P0.3/P1.2/P0.4. Wynik jawnego zestawu po iteracjach rozwojowych nie jest dowodem skuteczności na nowych tematach.

Po pomiarze P0.2 dołączono równoległy graf dowodowy. README odnotowuje dla wersji po integracji grafu zaliczenie 219 testów jednostkowych/integracyjnych, 23 przeglądarkowych, kontroli typów i kompilacji. Wynik 30/30 i mediana 11,588 s dotyczą zapisanej wersji bez grafu; nie obejmują dodatkowych wywołań analizy grafowej, o którą teraz prosi WWW. Graf nie zastępuje wspólnego werdyktu kanałów. Później dodano do wyszukiwania EUvsDisinfo. Pełny pomiar ścieżki WWW z grafem i aktualnym zestawem źródeł pozostaje otwarty.

## Co już mamy, co jest częściowe, czego brakuje

Ścieżki w kolumnie „Dowód” są względne wobec `Hack-Nation-2026/`.

| Obszar | Stan | Zakres i pozostała luka | Dowód |
|---|---|---|---|
| WWW i drugi kanał | GOTOWE | Responsywny WWW i automatyczny symulator Discord; bez integracji z rzeczywistym komunikatorem. | `src/components/workbench.tsx`, `channel-workbench.tsx`, `src/app/api/channels/discord-demo/route.ts` |
| Wspólny silnik | GOTOWE | Oba kanały używają `handleVerification → runVerification → verify`; formatowanie nie zmienia werdyktu. | `src/server/handle-verification.ts`, `src/core/channel.ts` |
| Spójność kanałów | Potwierdzona w P0.2 | W `p02-run4` uzyskano 30/30 dla tej samej sesji, tekstu, daty i konfiguracji. Drugi kanał może odczytać również tę samą nieudaną próbę; ponowienie w kanale, który już ją widział, uruchamia świeżą analizę. | `src/server/verification-service.ts`, `reports/benchmark/p02-run4/summary.json` |
| Walidacja tekstu | GOTOWE | Jedno pole tekstowe (20–500 znaków po usunięciu skrajnych spacji), opcjonalna data w formacie `YYYY-MM-DD`, schemat JSON, limit ciała żądania i kontrola origin. | `src/core/contracts.ts`, `src/server/handle-verification.ts` |
| URL i twierdzenia składowe | CZĘŚCIOWE | Graf wydziela do 6 twierdzeń z wpisanego tekstu. Pobranie artykułu z URL i osobna weryfikacja jego tez pozostają w P2. | `src/server/verify.ts`, `src/server/evidence-graph.ts` |
| Graf dowodowy w WWW | GOTOWE — mechanizm | Na żądanie WWW serwer równolegle analizuje twierdzenia składowe. Widok łączy werdykt, przesłanki, cytaty i dokumenty oraz pozwala pobrać graf jako JSON lub PNG. Awaria grafu ma osobny status. | `src/server/verification-service.ts`, `src/components/evidence-graph-view.tsx` |
| Fakt / opinia / niejasność | GOTOWE — mechanizm | Model planowania rozróżnia te przypadki; jakość oceniamy osobno w benchmarku. | `src/server/verify.ts`, `tests/statuses.test.ts` |
| Pięć werdyktów i statusy | GOTOWE | `supported`, `refuted`, `misleading`, `insufficient`, `not_checkable`; doprecyzowanie, wyjście poza zakres i awarie oddzielnie. | `src/core/contracts.ts` |
| Brak dowodów, kontekst i sprzeczność | CZĘŚCIOWE | Reguły, kontrola podstawy i audyt istnieją; wymagane potwierdzenie skuteczności na aktualnym kodzie. | `src/core/quotations.ts`, `evidence.ts`, `src/server/verify.ts` |
| Korpus i audyt źródeł | GOTOWE — liczbowo | 130 rekordów, 10 konserwatywnie grupowanych domen, 3 typy: official/news/encyclopedia; plik, `/zrodla`, `/api/corpus`. To katalog metadanych, nie lokalne archiwum pełnych tekstów. | `data/corpus/catalog.json`, `scripts/check-corpus.mjs` |
| Wyszukiwanie korpusu | GOTOWE — podstawowe | Dopasowanie słów w tytule i ścieżce URL, do 3 rekordów; tekst pobierany przy analizie. Brak indeksu pełnotekstowego/wektorowego i crona. | `src/server/corpus.ts` |
| Zewnętrzne źródła | GOTOWE | Tavily oraz dobierane do tematu Wikipedia, Sejm/ELI, arXiv i opcjonalne EUvsDisinfo. Wyniki podlegają wspólnej deduplikacji i kontroli cytatów. | `src/server/retrieval.ts`, `source-adapters.ts` |
| Wyszukiwanie wcześniejszych weryfikacji | CZĘŚCIOWE | Adapter EUvsDisinfo (EEAS) pobiera do 3 artykułów lub opisów przypadków. W opisie przypadku `SUMMARY` przytacza badaną narrację, a `RESPONSE` zawiera ustalenia. Google Fact Check i router regionalny pozostają w P2. | `src/server/euvsdisinfo.ts`, `src/server/retrieval.ts`, `src/server/verify.ts` |
| Dosłowność cytatów | GOTOWE — mechanizm | Model wybiera `quoteId`; serwer wstawia tekst i sprawdza źródło, fragment oraz dosłowne występowanie. Nie dowodzi to poprawności znaczeniowej każdego cytatu. | `src/core/quotations.ts`, `evidence.ts` |
| Dowody oddzielone od interpretacji | GOTOWE | Cytaty z relacją potwierdza/zaprzecza/kontekst, objaśnienie, linki i osobna lista materiałów niecytowanych. | `src/components/verification-view.tsx` |
| Metadane i aktualność | CZĘŚCIOWE | Są pola publikacji i pobrania; tylko 2/130 rekordów mają znaną datę publikacji. W wynikach wydawca jest często reprezentowany domeną; brak systematycznych flag archiwalności i rankingu świeżości. | `src/core/contracts.ts`, `src/server/corpus.ts`, `src/components/verification-view.tsx` |
| Siła podstawy | CZĘŚCIOWE | Liczba źródeł/grup i reguła ≥2 grup dla potwierdzenia/obalenia; brak pełnej jawnej oceny jakości, aktualności i rzeczywistej niezależności. | `src/core/evidence.ts` |
| Prompt injection | CZĘŚCIOWE | Separacja danych, filtry wejścia/źródeł, log zdarzeń i testy; ogólna skuteczność ≥90% niepotwierdzona. | `src/core/untrusted.ts`, `src/server/providers.ts`, `tests/hardening.test.ts` |
| Ograniczenia narzędzi i sekretów | CZĘŚCIOWE | Timeouty, limity rozmiaru bezpośrednich źródeł, stałe hosty API, konfiguracja serwerowa; otwarte wyszukiwanie WWW nie jest allowlistą wydawców. Przed zgłoszeniem potrzebny przegląd publikowanych plików i historii pod kątem sekretów. | `src/server/source-adapters.ts`, `read-body.ts`, `providers.ts`, `.gitignore` |
| Maskowanie danych | CZĘŚCIOWE | Przed modelem/wyszukiwaniem: e-mail, telefony, 11-cyfrowe identyfikatory i polskie rachunki. Brak numeru dowodu, pełnej obsługi zagranicznych IBAN i ogólnego rozpoznawania PII. Brief nie narzuca tej konkretnej listy wzorców. | `src/core/privacy.ts`, `tests/privacy.test.ts` |
| Retencja i usuwanie sesji | GOTOWE — lokalnie | Cache 5 min; SQLite do 24 h / 5000 wpisów; eksport JSON, usunięcie sesji i przerwanie aktywnych analiz. Nie usuwa danych wcześniej przekazanych dostawcom ani eksportów użytkownika. | `src/server/audit-store.ts`, `src/app/api/session/route.ts` |
| Podstawowy zapis przebiegu | GOTOWE | Zamaskowane pytanie, czas, kanał, wynik/błąd, metadane źródeł i hashe cytatów; bez archiwum pełnych treści. | `src/server/audit-store.ts`, `handle-verification.ts` |
| Pełna obserwowalność | CZĘŚCIOWE | Statusy wyszukiwania, wstrzymania, czasy etapów w logach; brak pełnej historii etapów w bazie, tokenów i kosztu odpowiedzi. | `src/server/verify.ts`, `audit-store.ts` |
| Postęp w UI | GOTOWE | SSE dla etapów i źródeł, wynik z cache i oczekiwanie na trwającą analizę oznaczone osobno. | `src/core/progress.ts`, `src/components/analysis-progress.tsx` |
| Awarie i limity dostawców | GOTOWE — mechanizm | Osobne błędy techniczne, ograniczone retry i model zapasowy Gemini; nie gwarantuje dostępności usług. | `src/server/gemini-transport.ts`, `config.ts` |
| Wymienność modelu/dostawcy | CZĘŚCIOWE | Model konfigurowalny, transport wydzielony; brak drugiego dostawcy i sprawdzonej migracji. | `src/server/providers.ts`, `gemini-transport.ts` |
| Limit ruchu i cache | CZĘŚCIOWE | Domyślnie 3 analizy jednocześnie, 100 prób online na proces, 10 prób/10 min na sesję; cache i deduplikacja tylko w procesie/sesji. Brak współdzielonego limitera RPM/TPM. | `src/server/limits.ts`, `verification-service.ts` |
| Język i dostępność | CZĘŚCIOWE | Polski UI, mobile i testy szerokości; brak pełnego audytu dostępności/kontrastu. WCAG AA jest celem jakościowym zespołu, brief wymaga responsywności i czytelności. | `src/components/`, `e2e/dashboard.spec.ts` |
| Alert / sprawy moderatora | BRAK | Powiadomienie odbiorcy wskazanego przez administratora pozostaje w P1. Deduplikacja i panel spraw należą do opcjonalnej pętli moderatora w P2. | Brak modułu moderatora |

## Przebieg weryfikacji i jednolite reguły

Zachowujemy istniejącą orkiestrację w kodzie. Model wykonuje ograniczone zadania: klasyfikację wejścia, wybór zapytań/API, ocenę materiałów i audyt. Kod kontroluje kolejność, dozwolone rozgałęzienia, limity oraz walidację. Wynik semantyczny nadal zależy od modelu; nie deklarujemy, że sam kod ustala prawdę. Nie przepisujemy silnika wyłącznie po to, by utworzyć listę `PIPELINE = [...]`.

| Etap | Obecne działanie / reguła odbioru | Stan |
|---|---|---|
| 1. Przyjęcie | Walidacja, sesja, origin, konfiguracja, cache i limity; błąd techniczny bez werdyktu. Ponowne użycie wyniku jest jawne. | GOTOWE |
| 2. Ochrona wejścia | Maskowanie rozpoznanego PII, oznaczenie danych jako niezaufanych, filtrowanie instrukcji i zapis zdarzeń. | CZĘŚCIOWE — zakres PII i skuteczność |
| 3. Planowanie | Fakt/opinia/niejasność/nieobsługiwany format; dla faktu dwa zapytania, w tym kontrdowody, oraz dobór API. Opinia i doprecyzowanie mogą zakończyć analizę przed wyszukiwaniem. | GOTOWE — mechanizm |
| 4. Pobranie | Korpus, WWW i adekwatne API równolegle; statusy ok/empty/partial/error/not_applicable. Brak podziału na obowiązkowe sekwencyjne wyszukiwanie pierwotne i wtórne. | GOTOWE |
| 5. Przygotowanie dowodów | Deduplikacja URL/treści, różnorodność grup wydawców, limity materiału, filtrowanie instrukcji w źródłach i katalog cytatów. | GOTOWE |
| 6. Ocena | Model wskazuje podstawę, relacje i cytaty; kod sprawdza identyfikatory, cytaty i zgodność kategorii z zadeklarowaną podstawą. | GOTOWE — mechanizm |
| 7. Aktualność i siła | Daty/kontekst trafiają do oceny; trzeba dodać audytowalne ostrzeżenia i opis siły podstawy zgodnie z P1.1. | CZĘŚCIOWE |
| 8. Kontrola końcowa | W razie potrzeby najwyżej jedna naprawa lub uzupełnienie oceny, kontrola grup źródeł, audyt znaczenia. Negatywny audyt daje `unable_to_verify`. Stałe wstrzymanie bez dowodów po udanym wyszukiwaniu nie wymaga kolejnego wywołania modelu. P0.1 wdrożone: inwentarz ustaleń, przypisania do cytatów i kontrola każdego elementu. Jakość semantyczna wymaga pomiaru P0.2/P0.3. | CZĘŚCIOWE |
| 9. Zapis i odpowiedź | Zapis podstawowego przebiegu przed udanym dostarczeniem, polskie uzasadnienie, dowody, ograniczenia i format kanału. Awaria zapisu udanego sprawdzenia daje `AUDIT_UNAVAILABLE`. | GOTOWE — bez kosztów |
| 10. Opcjonalne rozszerzenia | Graf analizuje twierdzenia składowe. EUvsDisinfo jest dostępne przy pobieraniu źródeł w analizie głównej i grafowej. Analiza URL i sprawy moderatora pozostają do wdrożenia. | CZĘŚCIOWE |

### Routing, brak wyników i awarie

1. Brak trafienia w lokalnym katalogu nie oznacza automatycznie `out_of_scope`. Dla obsługiwanej tezy uruchamiamy dostępne wyszukiwanie ogólne. `out_of_scope` opisuje jawne granice funkcjonalne, np. sam URL w wersji tekstowej.
2. Udane wyszukiwanie bez adekwatnych dowodów może dać `insufficient` z wyjaśnieniem, czego nie ustalono. Nie oznacza to fałszu ani nieistnienia zdarzenia.
3. Częściowa awaria źródła musi być ujawniona. Analizę można kontynuować, jeśli pozostałe materiały wystarczają i przechodzą zwykłe kontrole. Brak materiału wskutek awarii, niepełne wyszukiwanie bez użytecznych dowodów, awaria modelu lub odrzucenie oceny przez audyt dają status bez werdyktu, zależny od przyczyny.
4. Nie wyłączamy wymaganych dowodów ani kontroli cytatów tylko z powodu obciążenia. Po osiągnięciu limitu uczciwie odrzucamy/odraczamy żądanie. Funkcje dodatkowe można pominąć z podaniem przyczyny; nie wolno po tym udawać pełnego sprawdzenia.
5. Źródła pierwotne i wtórne dobieramy do tezy. Nie ma sztywnej reguły „wyłącz wtórne po dwóch pierwotnych”. Trzeba aktywnie uwzględniać kontrdowody; to samo zdarzenie opisane przez dwóch wydawców może pochodzić z jednego komunikatu.
6. Dopasowanie domeny/treści do incydentu jest kontekstem, nie automatycznym werdyktem. Status autora, popularność i sankcje również nie zastępują dowodów dotyczących tezy.
7. EUvsDisinfo uruchamia się, gdy ustawiono `EUVSDISINFO_API_KEY` i planer wybierze zapytanie dla tego źródła. W pozostałych przypadkach otrzymuje status `not_applicable`. Awaria adaptera jest widoczna w statusie wyszukiwania. Google Fact Check pozostaje propozycją.

Obecny wspólny limit analizy wynosi maksymalnie 60 s; wyszukiwanie ma 15 s, a operacje modelu osobne budżety i rezerwę na audyt. Cel mediany ≤30 s potwierdzamy pomiarem, nie samym ustawieniem timeoutu. Nie wymagamy, aby opinia, błąd wejścia i pełna analiza przechodziły identyczną liczbę kroków; testujemy właściwe rozgałęzienia.

## Źródła: jakość przed rozbudową katalogu

Katalog roboczy: [catalog.json](data/corpus/catalog.json). Kontrola `npm run corpus:check` potwierdza 130 rekordów, 10 domen i trzy typy. Potwierdza strukturę/liczby, a nie aktualną dostępność wszystkich stron, wiarygodność treści, poprawność licencji ani adekwatność do każdej tezy.

Do odbioru P1.1/P1.3:

- [ ] Uzupełnić daty publikacji na podstawie dokumentu lub metadanych źródła. Pozostawiać jawny brak, jeśli daty nie da się ustalić; nie zastępować jej datą pobrania.
- [ ] Rozróżnić datę publikacji, aktualizacji i okres opisywanego zdarzenia. Stary dokument może być właściwym dowodem historycznym; nowa publikacja może opisywać stare zdarzenie.
- [ ] Dodać ostrzeżenie o archiwalności/nieadekwatnym czasie tam, gdzie wpływa na ocenę; sprawdzić brakujący kontekst na nowych tezach.
- [ ] Przekazywać rzeczywistego wydawcę do danych wyniku i UI, gdy jest znany; domenę oznaczać jako identyfikator zastępczy.
- [ ] Opisać kwalifikowanie, aktualizowanie i wykluczanie źródeł oraz warunki wykorzystania materiału. Obecne pole licencji katalogu metadanych nie jest zgodą na redystrybucję pełnych tekstów.
- [ ] Wskazać, kiedy materiał jest pierwotny dla konkretnej tezy. „Urzędowe” nie zawsze znaczy „pierwotne”; obecna etykieta domeny to heurystyka, nie uzasadnienie prawdziwości.
- [ ] Wyjaśnić ograniczenie grupowania: wszystkie gov.pl liczą się obecnie jako jedna grupa, a różne domeny nie gwarantują niezależności.

Pełnotekstowy indeks, cron, cache źródeł live i router regionalny są P2. Ewentualne przechowywanie pełnych tekstów wymaga wcześniej określonych zasad licencji, retencji, dostępu i usuwania. Na MVP nie trzeba przepisywać istniejącego JSON do YAML.

## Mierniki, testy i warunki odbioru

Historyczny wynik kontroli sprzed P0.1: **167 testów jednostkowych/integracyjnych zaliczonych, 5 pominiętych; 19 testów przeglądarkowych zaliczonych, 4 live pominięte; typecheck i corpus:check zaliczone**. Nie był to nowy płatny benchmark. Testy z podmienionym HTTP sprawdzają kod, nie skuteczność rzeczywistych usług.

Raporty w `reports/` są dostępne lokalnie. Git pomija ten katalog w obecnej wersji. Archiwum P0.2 można odczytać z historii, np. poleceniem `git show 719daaa:reports/benchmark/p02-report.md` uruchomionym w repozytorium.

Dowody historyczne:

- [hardening-comparison.json](reports/benchmark/hardening-comparison.json): pełne 30 przypadków po wcześniejszych poprawkach; macro-F1 0,930, mediana 23,259 s, p95 57,835 s, wstrzymanie 2/3, spójność kanałów 29/30.
- [reliability-privacy-online/results.json](reports/benchmark/reliability-privacy-online/results.json): późniejszy przebieg 18/30, przerwany po trzech kolejnych limitach dostawcy; 13 poprawnych zakończeń, brak prób N01–N03. Nie zastępuje pełnej walidacji obecnego kodu.
- Starszy `reports/benchmark/summary.json` nie jest bieżącym raportem po wszystkich poprawkach. Liczby z różnych wersji nie mogą być łączone w jeden deklarowany wynik.

Wyniki liczbowe w tabeli dotyczą zapisanych przebiegów `p02-run4` i `p02-controlled`, sprzed integracji grafu i EUvsDisinfo.

| Miernik briefu | Cel | Wynik historyczny i pozostała praca |
|---|---|---|
| Trafność | macro-F1 ≥0,75 | GOTOWE w jawnym zestawie: 1,000, pełne 30 przypadków p02-run4. Brak niezależnego zestawu ukrytego. |
| Pokrycie cytowań | ≥95% tez faktograficznych z dowodem | GOTOWE strukturalnie: 44/44 = 100% w p02-run4. To kompletność przypisań, nie niezależnie oceniona adekwatność lub atomowość. |
| Poprawność cytowań | ≥85% | BRAK niezależnej oceny znaczeniowej; jest formularz i sprawdzanie zgodności jego hasha z wynikiem. P0.3. |
| Wstrzymanie przy braku dowodów | ≥80% | GOTOWE w jawnym zestawie: 3/3, bez zaliczania błędów technicznych jako wstrzymania. Próba jest mała. |
| Odporność na injection | ≥90% | CZĘŚCIOWE: 3/3 ataków na wejściu w p02-run4; 2/2 ataków w źródłach odparte z zapisanym zdarzeniem w p02-controlled. Wynik małej próby nie jest ogólną gwarancją ≥90%. |
| Czas | mediana ≤30 s dla obsługiwanego wejścia | GOTOWE w pomiarze tekstowym: mediana 11,588 s, p95 16,447 s, maksimum 17,383 s. Brak błędów w p02-run4; cache drugiego kanału nie jest czasem inferencji. |
| Koszt | deklarowany i zmierzony koszt 100 testów | BRAK; dodatkowo szacunek kosztu 1000 zapytań i utrzymania kanału. Nie przyjmować kosztu zerowego przy braku pomiaru. |
| End-to-end | 100% obowiązkowych scenariuszy bez ingerencji | CZĘŚCIOWE względem całego briefu: 30/30 lokalnych scenariuszy w p02-run4; nie wykonano niezależnej próby uruchomienia przez jury, niewdrożonych funkcji nie zaliczamy. |
| Spójność kanałów | 100% próby międzykanałowej | GOTOWE w p02-run4: 30/30, z porównaniem ustaleń, uzasadnienia, ograniczeń, cytatów, źródeł i identyfikatora. To współdzielenie migawki w sesji, nie identyczność niezależnych generacji. |
| Pętla informacji | 100% utworzeń/deduplikacji, jeśli wdrożona | BRAK — pełna funkcja P2; nie deklarować zaliczenia niezaimplementowanego scenariusza. |

Pozostałe prace ewaluacyjne:

- [x] P0.1: wprowadzić mapowanie ustaleń do dowodów, serwerowe składanie uzasadnienia, blokadę brakujących odwołań i kontrolę każdego ustalenia w audycie. Miernik liczy ustalenia, a nie odpowiedzi z cytatem; testy obejmują wszystkie ścieżki publikacji.
- [x] Wykonano pełny pomiar online wersji P0.2 (`p02-run4`, 30/30, mapowanie 44/44).
- [ ] Uzupełnić pomiar WWW. `scripts/benchmark.mjs` wysyła tekst i opcjonalną datę do `/api/verify`. Interfejs WWW wysyła także `evidenceGraph: true`. Zmierzyć ten wariant, zapisać `graphStatus`, czas odpowiedzi i zgodność wspólnego wyniku z adapterem Discord. Odnotować konfigurację i wybór EUvsDisinfo bez zapisywania klucza.
- [ ] Powtórzyć S02 na kontrolowanych źródłach. Oczekiwany wynik to `insufficient` z jawnym wskazaniem sprzecznych pomiarów. Ostatni zapisany przebieg zakończył się bez opublikowanego werdyktu.
- [ ] Niezależnie sprawdzić podział na fakty, adekwatność cytatów i próg ≥85% (P0.3).
- [ ] Zachować ≥30 przypadków i jawne etykiety, dodać nowe przypadki regresyjne niezależne od przykładów użytych do poprawiania promptów; bez hardkodowania konkretnych odpowiedzi.
- [x] Sporządzić mapę A–J (zapisana w raporcie P0.2): A fakt, B kontekst, C sprzeczność, D brak dowodów, E atak, G kanały; F multimodalność i H pętla warunkowe. W przebiegu P0.2 scenariusze I (URL/incydent) i J (OCR/reverse image) były poza zakresem. Po dodaniu EUvsDisinfo pozostaje ocenić, czy użytkownik widzi dopasowanie znanej narracji jako kontekst w scenariuszu I. Brak funkcji nie liczy się jako zaliczony test.
- [x] Zapisać wersję kodu, hash zestawu, konfigurację modeli, czas, wszystkie błędy i ograniczenia odtwarzalności źródeł live. Utrwalić tylko materiał, którego przechowanie jest dopuszczalne.
- [ ] Przeprowadzić pełny pomiar, niezależny przegląd cytatów, koszt i próbę jury na przygotowanej instrukcji; wskazać niespełnione progi zamiast ukrywać je średnią.

## Prywatność, alerty i dostawcy

- [x] Maskowanie podstawowych wzorców przed wysłaniem treści do modelu i wyszukiwania, brak odwracalnej mapy.
- [x] Lokalna retencja, eksport sesji i usuwanie jej danych oraz aktywnych analiz.
- [ ] Przejrzeć oczywiste PII pomijane przez wzorce, w tym numer dowodu; ustalić wspierany zakres i sprawdzić, czy maskowanie nie niszczy kontekstu tezy.
- [ ] Udokumentować miejsce przetwarzania, retencję i ograniczenia dostawców. Lokalny serwer nie oznacza lokalnego przetwarzania modelu/wyszukiwania.
- [ ] Opisać i sprawdzić interfejs zmiany dostawcy; model zapasowy Gemini nie jest drugim dostawcą.
- [ ] Wdrożyć powiadomienie opisane na s. 2 briefu. Administrator wskazuje odbiorcę. Ustalić regułę wysokiego ryzyka i powtórzeń, ograniczyć treść powiadomienia do potrzebnych danych i zapisać wynik dostarczenia. Pełna pętla tworzenia i grupowania spraw jest funkcją premiowaną (s. 4).

## Architektura MVP i zwiększony ruch

Obecny układ:

```text
WWW (SSE) / adapter Discord demo
                |
       wspólna obsługa żądania
                |
 limity + cache/deduplikacja w pamięci sesji
                |
                +-- verify: plan -> źródła -> ocena -> audyt ustaleń
                |
                +-- na żądanie WWW, równolegle: budowa i walidacja grafu
                |
       wspólny wynik + graf/status dla WWW
                |
       zapis przebiegu w SQLite -> odpowiedź kanału
```

To lokalny proces Next.js, bez trwałej kolejki, osobnych workerów, Redisa i Postgresa. Cache nie jest współdzielony między użytkownikami: 1000 osób pytających o to samo nie oznacza dziś jednego wykonania modelu. Anulowanie analizy inicjującej może przerwać oczekujący drugi kanał; jest to ograniczenie opisane w README.

Do odbioru P1.2:

- [ ] Zmierzyć zachowanie lokalnego limitera przy zwiększonym ruchu (w tym 429), medianę/p95, odsetek błędów i liczbę wywołań dostawcy. Rozdzielić test z kontrolowanym HTTP od pomiaru realnych limitów usług.
- [ ] Raportować koszt trafienia w cache i nowej analizy; oszacować 1000 zapytań przy jawnych założeniach. Adapter demo nie ma opłaty komunikatora, ale analiza nie jest bezkosztowa.
- [ ] Opisać granice wdrożenia oraz bezpłatny dostęp jury po stronie usługi. Nie podawać czasu oczekiwania bez kolejki i wiarygodnego pomiaru.

Po MVP, jeśli pomiary uzasadnią skalowanie: współdzielony limiter, magazyn wyników i deduplikacja, kolejka i workery, cache źródeł oraz limity per domena; dopiero następnie repliki API/load balancer i ewentualna migracja bazy. Docker, Postgres/pgvector, nginx, Kubernetes/HPA/KEDA i test 1000 równoczesnych użytkowników są opcjami P2, nie listą obowiązkową na 24 h. Cache semantyczny wymaga osobnej walidacji negacji, dat, miejsc i prywatności.

## Materiały zgłoszeniowe — P1

| Materiał | Stan | Do wykonania |
|---|---|---|
| Nazwa zespołu, tytuł, opis ≤4000 znaków | CZĘŚCIOWE | Nazwy KITCHECK/Prawdowid istnieją; wybrać tytuł zgłoszenia, uzupełnić zespół i gotowy opis. |
| Prezentacja PDF ≤12 slajdów | BRAK w workspace | Problem, użytkownicy, architektura, demo, aktualne wyniki, ryzyka, dalsze kroki. |
| Film demo ≤3 min | BRAK w workspace | Działająca analiza i adapter, dowody, brak dowodów i błąd techniczny; link do filmu. |
| Repozytorium i instrukcja jury | CZĘŚCIOWE | Repo i README są; sprawdzić uruchomienie z czystej kopii, dostęp jury i komplet plików do udostępnienia. |
| Architektura, dane, modele, dostawcy, ograniczenia | CZĘŚCIOWE | Opis istnieje; ujednolicić aktualny stan, migrację i miejsce przetwarzania. |
| Źródła, licencje, kwalifikacja, aktualizacja | CZĘŚCIOWE | Katalog i ograniczenia są; domknąć przegląd warunków oraz aktualności. |
| Wyniki i odtworzenie testów | CZĘŚCIOWE | Runner i zestaw przypadków są w repozytorium. Do pakietu dla jury dołączyć raport aktualnej wersji wraz z danymi do odtworzenia. |
| Lista ryzyk | CZĘŚCIOWE | Zebrać halucynacje, stronniczość źródeł, prywatność, injection, dostępność i nadużycia wraz z ograniczeniami zabezpieczeń. |
| Koszt i większy ruch | BRAK kompletnego raportu | Koszt 100 testów, szacunek 1000 zapytań, kanał i wyniki próby obciążenia. |
| Sekrety i dane w publikacji | CZĘŚCIOWE | Konfiguracja serwerowa i ignorowanie plików istnieją; sprawdzić kod, historię, raporty, slajdy i film przed publikacją. |

Publiczne demo jest opcjonalne. Lokalne, odtwarzalne uruchomienie przez jury musi działać end-to-end; ręcznie przygotowane przykłady w UI mają pozostać jawnie oznaczone.

## Rozszerzenia po odbiorze MVP — P2

| Rozszerzenie | Stan obecny |
|---|---|
| Pobieranie artykułu z URL i weryfikacja jego tez | BRAK |
| Google Fact Check i dopasowanie do znanych incydentów | CZĘŚCIOWE — wyszukiwanie przypadków EUvsDisinfo dla tekstu jest wdrożone. Do odbioru pozostaje scenariusz I z briefu. Brak integracji Google Fact Check. |
| Katalog regionalny, router temat/region, cron i indeks treści | BRAK; istnieje katalog JSON i proste wyszukiwanie metadanych |
| OCR, transkrypcja, EXIF, perceptual hash, reverse image API | BRAK; przy wdrożeniu ujawnić koszt, retencję, zakres i ograniczenia |
| Pełna pętla moderatora, deduplikacja spraw, panel | BRAK. Podstawowe powiadomienie opisano w P1.4. |
| Oś czasu dowodów | BRAK osobnego widoku chronologicznego. Wdrożony graf powiązań opisano w tabeli funkcji WWW. |
| Wielojęzyczne wyszukiwanie EN/UA/RU/DE | CZĘŚCIOWE: materiały obcojęzyczne mogą trafić do silnika; brak dedykowanej strategii i walidacji języków |
| Neutralne ostrzeżenia o statusie źródła | BRAK; wymagają aktualnej, sprawdzalnej podstawy i oddzielenia od werdyktu |
| Eksport CSV, OpenCTI/DISARM, OpenAPI | BRAK. Dostępne eksporty obejmują zapis sesji w JSON oraz graf w JSON (z cytowanymi fragmentami) i PNG. |
| Pełna architektura plug-in, kolejni dostawcy i kanały | CZĘŚCIOWE: moduły są wydzielone; transporty i drugi dostawca wymagają wdrożenia |
| Współdzielona kolejka/cache/limiter, wiele instancji | BRAK |
| Docker i publiczne demo | BRAK gotowego artefaktu w sprawdzonym workspace |
| Dashboard jakości | BRAK; obecny panel pokazuje postęp pojedynczej analizy, nie zbiorcze wyniki ewaluacji |
| Modele EOG / self-hosted | BRAK integracji; lokalne uruchomienie aplikacji i audyt kodu są możliwe, analiza używa zewnętrznych usług |
| Archiwizacja pełnych treści/obrazów | BRAK; obecnie minimalizujemy zapis. Najpierw zasady licencji, retencji, dostępu i usuwania |

## Katalog propozycji od mentora — zachowany do dalszego rozwoju

Poniższa lista pochodzi z wcześniejszego planu. **Nie jest listą wdrożonych adapterów ani obowiązkowym zakresem MVP.** Oznaczenia metod i świeżości są propozycjami; aktualnej dostępności, interfejsów i warunków tych serwisów nie weryfikowano w tym audycie. Przed integracją sprawdzić konkretny endpoint, przydatność dla wybranego zakresu, licencję i limity.

| Temat (tag) | Źródła | Świeżość / metoda |
|-------------|--------|-------------------|
| `ostrzezenia-ogolne` | https://www.gov.pl/web/gov/ostrzezenia (także filtr per województwo), https://www.gov.pl/web/mswia/regionalny-system-ostrzegania, https://www.gov.pl/web/mswia | live, cache |
| `kryzys-bezpieczenstwo` | https://www.gov.pl/web/rcb/raport-dobowy3, https://www.gov.pl/web/rcb/strona-glowna-rzadowego-centrum-bezpieczenstwa, https://www.gov.pl/web/premier | dzienne |
| `bezpieczenstwo-publiczne` (policja) | https://policja.pl/pol/aktualnosci, https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci (wzorzec dla KWP regionalnych) | indeks, często |
| `pozary-ratownictwo` | https://www.gov.pl/web/kgpsp/aktualnosci | indeks, często |
| `obrona-wojsko` | https://www.gov.pl/web/obrona-narodowa/aktualnosci5 | indeks |
| `zdrowie-sanepid` | https://www.gov.pl/web/gis/ostrzezenia | indeks |
| `promieniowanie` | https://www.gov.pl/web/paa/panstwowa-agencja-atomistyki, https://monitoring.paa.gov.pl/ | live (dane pomiarowe) |
| `jakosc-powietrza` | https://powietrze.gios.gov.pl/pjp/ | live |
| `cyberbezpieczenstwo` | https://moje.cert.pl/komunikaty/ | indeks |
| `transport-drogowy` | https://drogi.gddkia.gov.pl/informacje-drogowe, https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien, https://drogi.gddkia.gov.pl/mapy/mapa-informacji-drogowej, https://www.gov.pl/web/gddkia/informacja-drogowa---19-111 | live |
| `transport-ogolny` | https://www.gov.pl/web/infrastruktura, https://www.gov.pl/web/infrastruktura/aktualnosci, https://www.gov.pl/web/infrastruktura/prawa-pasazerow, https://www.gov.pl/web/infrastruktura/infolinia-dla-obywatela, https://www.gov.pl/web/infrastruktura/dane-kontaktowe | indeks |
| `transport-lotniczy` | https://ulc.gov.pl/, https://ulc.gov.pl/prawa-pasazera, https://ulc.gov.pl/prawa-pasazera/poradnik-dla-pasazerow | indeks |
| `transport-kolejowy` | https://portalpasazera.pl/, https://utk.gov.pl/pl/pasazerowie | live / indeks |
| `morze-zegluga` | https://kgsok.pl/, https://www.sar.gov.pl/, https://www.umgdy.gov.pl/, https://www.ums.gov.pl/bezpieczenstwo-morskie/warunki-zeglugi, https://www.gov.pl/web/wody-polskie/komunikaty-nawigacyjne, https://baltyk.imgw.pl/ | live / indeks |
| `pogoda-hydrologia` | https://meteo.imgw.pl/, https://hydro.imgw.pl/ | live |
| `podroze-zagranica` | https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych, https://odyseusz.gov.pl/ | indeks |
| `fact-check` | Google Fact Check Tools API (https://developers.google.com/fact-check/tools/api/reference/rest?hl=pl, podgląd: https://toolbox.google.com/factcheck/explorer/search/list:recent;hl=pl) | API, wymaga klucza |
| `dezinformacja-fimi` | EUvsDisinfo (instrukcja: https://euvsdisinfo.eu/public-docs/How_to_grab_all_Articles_and_Cases_from_disinfo.pdf) | Wdrożono wyszukiwanie przez MCP. Lokalny indeks całej bazy pozostaje propozycją. |

Zadania dopiero dla wybranych integracji P2:

- [ ] Wybrać niewielki zakres tematyczny i sprawdzić korzyść w ewaluacji, zamiast podłączać cały katalog.
- [ ] Rozszerzyć istniejący katalog o temat, region, metodę, aktualizację i zasady użycia; format YAML nie jest wymagany.
- [ ] Zweryfikować dostęp do Google Fact Check. Dla wdrożonego EUvsDisinfo udokumentować koszt, limity i warunki użycia przed zgłoszeniem.
- [ ] Dodać adaptery z timeoutem, limitem rozmiaru, testami częściowej awarii i jawnym statusem w UI.
- [ ] Jeśli potrzebny jest indeks/cron lub cache live, ustalić retencję, TTL i usuwanie, nie archiwizować treści bez ustalonych zasad.
- [ ] Ponownie sprawdzić liczby domen/typów oraz jakość korpusu. Sama lista linków do instytucji nie dowodzi spełnienia wymogu 100 rekordów.
