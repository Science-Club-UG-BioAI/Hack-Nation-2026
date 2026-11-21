# Niezależna ocena cytatów (P0.3)

Cel: zmierzyć poprawność znaczeniową cytatów (próg briefu ≥85%). Strukturalne przypisanie cytatu do ustalenia (pokrycie 44/44) i audyt tego samego modelu nie są oceną referencyjną.

## Jednostka oceny

Jeden element = jeden cytat (`evidence[i]`) w jednej odpowiedzi przebiegu. Identyfikator: `<id przypadku>:<indeks cytatu>`. Formularz generuje:

```bash
npm run benchmark:evaluate -- reports/benchmark/<przebieg>
```

Powstaje `citation-review.template.json`. Recenzent zapisuje wypełnioną kopię jako `citation-review.json` w tym samym katalogu i ponownie uruchamia polecenie. Wynik trafia do `summary.json` (`citationReview`, bramka `citationCorrectness`).

Formularz jest przypięty do hasha `results.json`. Każda zmiana pliku wyników unieważnia ocenę („Stale review”).

## Rubryka

Dla każdego elementu recenzent ocenia cztery wymiary: `true`, `false` albo `null`, gdy wymiar nie dotyczy elementu.

| Pole | Pytanie | `false`, gdy |
|---|---|---|
| `entails` | Czy cytat sam w sobie uzasadnia każde przypisane ustalenie (`findings`)? Dla cytatu bez ustaleń: czy uzasadnia deklarowaną relację wobec tezy? | Cytat dotyczy innego podmiotu, okresu lub liczby; uzasadnia tylko część ustalenia; wymaga wiedzy spoza cytatu. |
| `relationCorrect` | Czy relacja `supports` / `contradicts` / `context` jest właściwa wobec tezy? | Np. cytat korygujący wniosek oznaczony jako `supports`; cytat neutralny oznaczony jako `contradicts`. |
| `atomic` | Czy każde przypisane ustalenie to jedno sprawdzalne twierdzenie? | Ustalenie łączy kilka faktów, z których cytat potwierdza tylko część. `null` dla cytatu bez ustaleń. |
| `factual` | Czy przypisane ustalenia są faktami, a nie opinią, oceną lub wnioskiem modelu? | Ustalenie zawiera ocenę („słusznie”, „bezpodstawnie”) lub wniosek wykraczający poza cytat. `null` dla cytatu bez ustaleń. |

`valid = true` tylko wtedy, gdy żaden oceniony wymiar nie ma wartości `false`. Pole `reason` jest obowiązkowe: jedno zdanie uzasadnienia. Element bez `valid` lub bez `reason` nie wchodzi do wyniku.

Wynik: `valid / ocenione`. Bramka `citationCorrectness` liczy się tylko przy komplecie ocen (`complete: true`). Ocena częściowa jest raportowana jako próba, nie jako wynik.

## Recenzent i metoda

W formularzu wypełnić:

```json
"reviewer": "imię i nazwisko lub identyfikator",
"method": { "kind": "human | model | mixed", "model": "identyfikator modelu albo null", "notes": "jak oceniano" }
```

- `human`: osoba spoza autorów zmienianej logiki odpowiedzi, jeśli to możliwe.
- `model`: model recenzenta musi być inny niż modele z `auditedModels` w formularzu. Kod odrzuca ocenę, gdy model jest taki sam albo nie został podany.
- `mixed`: model ocenia wszystko, człowiek sprawdza co najmniej elementy z `valid = false` i losową próbę ≥20 pozostałych. Opisać to w `notes`.

Ocena modelowa jest niezależna od modelu audytu, ale nie od zespołu, który budował system i zestaw. Raport musi to stwierdzać wprost.

## Zasady

- Nie poprawiać `results.json` po wygenerowaniu formularza.
- Nie pomijać trudnych elementów. Wątpliwość = `false` z uzasadnieniem albo `null` w wymiarze i opis w `reason`.
- Oceniać na podstawie cytatu, tezy i ustaleń. Strona źródła (`url`) służy tylko do sprawdzenia kontekstu cytatu, nie do uzupełniania brakującej treści.
- Wynik zapisać razem z hashem przebiegu w raporcie zgłoszeniowym.
