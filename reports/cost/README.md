# Koszty — stan 22.11.2026

Bieżąca migawka do odtworzenia obliczeń: [status-2026-11-22.json](../../data/measurements/status-2026-11-22.json). Oddzielamy rzeczywiste wywołania, wycenę zużycia, symulację oraz ekstrapolację. Kwoty nie są odczytem rachunku konta. Podatki, hosting, darmowe pule i rabaty pozostają poza wyceną.

## Jedna rzeczywista analiza po optymalizacji

[Wynik i podsumowanie](optimized-live-2026-11-22T01-28-23-614Z/summary.json), [odpowiedź](optimized-live-2026-11-22T01-28-23-614Z/response.json), [liczniki z audytu](optimized-live-2026-11-22T01-28-23-614Z/audit.json).

Teza: „Polska przystąpiła do NATO 12 marca 1999 roku.” Świeża sesja, API JSON, bez żądania grafu, brak cache. HTTP 200, completed/supported, czas 16,914 s. To jedna obserwacja, nie nowy benchmark jakości.

| Składnik | Zużycie | Wycena |
| --- | --- | ---: |
| Tavily | Basic 1 kredyt + dwa Advanced po 2 kredyty | 0,0400000 USD |
| Gemini 3.1 Flash-Lite | 3 wywołania; 22 456 tokenów wejścia, 2653 wyjścia z rozumowaniem, 0 cache dostawcy | 0,0095935 USD |
| Znana suma | Gemini + Tavily | **0,0495935 USD** |
| Google Fact Check | 2 wywołania, brak ustalonej ceny | **nieznana** |
| Pełny koszt | Wszystkie wywołania | **null** |

Stawki sprawdzono 22.11.2026: [Gemini Standard](https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite): wejście 0,25 USD/mln, wyjście 1,50 USD/mln; [Tavily PAYGO](https://docs.tavily.com/documentation/api-credits): 0,008 USD/kredyt. Wyliczenie: 22 456 × 0,25 / 1 000 000 + 2653 × 1,50 / 1 000 000 + 5 × 0,008 = 0,0495935 USD.

Przy dokładnie tym samym profilu 100 analiz daje **4,95935 USD**, a 1000 daje **49,5935 USD** znanych składników. To ekstrapolacja jednej udanej analizy, nie zmierzona średnia i nie pomiar 100/1000 testów. Nie obejmuje nieznanego kosztu Fact Check, obrazów, zmian długości odpowiedzi, ponowień ani dodatkowego wyszukiwania. Adapter demonstracyjny nie pobiera opłaty komunikatora; model i wyszukiwanie nadal mają koszt.

## Aktualny kontrolowany test rozliczeń — bez zewnętrznych API

Wykonano 100 nowych analiz i 100 ponownych dostarczeń przez adapter demo na aktualnej ścieżce. [Dane](offline-optimized-2026-11-22/offline.json), [hashe kodu przed pomiarem](offline-optimized-2026-11-22/provenance.json).

| Składnik | Kontrolowane zużycie | Wartość według taryfy |
| --- | ---: | ---: |
| Gemini | 300 symulowanych wywołań, 710 000 tokenów wejścia i 75 000 wyjścia | 0,29 USD |
| Tavily | 300 symulowanych wywołań, 500 kredytów | 4,00 USD |
| Łącznie | 100 nowych analiz | **4,29 USD** |
| Ponowne dostarczenie | 100 trafień w cache, bez wywołań dostawców | 0 USD |
| Faktyczne opłaty w tym teście | Wszystkie odpowiedzi dostawców podstawione lokalnie | **0 USD** |

Dane o tokenach są zadane w teście; odpowiedzi modeli również są sztuczne. Wpisy URL w fixture tylko sprawdzają politykę domen, nie są publikacjami użytymi jako dowody online. Test sprawdza trasę, liczniki, cache i rachunek, a nie trafność odpowiedzi, koszty rzeczywistych 100 analiz czy dostępność API. Nie zalicza wymogu 100 testów online z briefu.

Odtworzenie: `node scripts/load-test.mjs --benchmark`. Wynik trafia do nowego katalogu z datą. `MEASUREMENT_OUTPUT` pozwala wskazać nowy katalog; istniejące provenance blokuje nadpisanie. Nie trzeba wczytywać .env.local ani podawać kluczy. Skrypt blokuje sieć do dostawców i zapisuje tylko lokalne pomiary.

## Historia — nie stosować jako bieżącej wyceny

- [offline.json](offline.json), 21.11.2026: poprzednia symulacja 100 analiz, 200 wywołań Tavily i wycena 3,49 USD (0,0349/analizę). Te wartości nie opisują obecnej ścieżki z wyszukiwaniem kontekstu.
- [Trzy rzeczywiste próby przed optymalizacją](../benchmark/audit-2026-11-22-three/cost-summary.json): znana suma 0,31384825 USD, średnia 0,1046160833 USD, 1/3 oczekiwanych wyników. Błędy pozostają w mianowniku; tej średniej nie łączymy z jedną próbą po optymalizacji.

Gotowy wynik ma ważność do godziny w tej samej sesji; wyniki wyszukiwania do 5 minut, daty do godziny. `usage.cached` oznacza ponowne dostarczenie gotowej odpowiedzi, nie każde częściowe użycie bufora źródeł. Trafienia w bufor wyszukiwania nie dodają wywołania Tavily. Pełny koszt pozostaje null, jeśli choć jeden składnik ma nieznaną cenę lub zużycie. Liczba searchCalls obejmuje również bezpośrednie API: w próbie online 5 = 3 Tavily + 2 Fact Check.
