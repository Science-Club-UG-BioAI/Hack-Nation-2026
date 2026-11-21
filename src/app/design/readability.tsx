"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import styles from "./readability.module.css";

type Variant = "before" | "after";

const claim = "Polska przystąpiła do NATO 12 marca 1999 roku.";

const changes = [
  {
    n: 1,
    title: "Większy tekst",
    text: "Nic poniżej 13 px, tekst do przeczytania 14–16 px. Etykiety zwykłymi literami zamiast małych wersalików z rozstrzeleniem.",
  },
  {
    n: 2,
    title: "Tytuł zamiast hasła",
    text: "„Sprawdź twierdzenie” i jedno zdanie, co się stanie. Bez hasła, ozdobnej plakietki i notki „Dowody, które możesz…”.",
  },
  {
    n: 3,
    title: "Wynik wyżej",
    text: "Po zakończeniu przebieg zwija się do jednej linii z liczbami. Kafelki znikają, więc ocena jest widoczna bez przewijania.",
  },
  {
    n: 4,
    title: "Etykieta demo nad oceną",
    text: "Ocena i uzasadnienie są obok siebie, a informacja o demo jest krótką etykietą na górze.",
  },
  {
    n: 5,
    title: "Twoja teza i sprawdzane twierdzenie",
    text: "Nad oceną widać tezę wpisaną przez użytkownika i twierdzenie z dodanym kontekstem, którego dotyczy ocena. Dopiski są podkreślone i wymienione słowami. Gdy obie wersje są takie same, zostaje jeden wiersz.",
  },
  {
    n: 6,
    title: "Polski wybór pliku",
    text: "Własny przycisk „Wybierz obraz” zamiast przeglądarkowego „Choose file / No file chosen”.",
  },
  {
    n: 7,
    title: "Kontrast AA",
    text: "Podpisy typu „opcjonalnie” mają 6,9:1 zamiast 4,33:1. Kilkanaście odcieni szarości zastępują dwa.",
  },
  {
    n: 8,
    title: "Uzasadnienie w kolorze tekstu",
    text: "Najważniejszy akapit jest czarny, nie szary, i ma mniejszą interlinię.",
  },
];

const originalClaim = "Polska weszła do NATO w 1999.";

export function ReadabilityCompare() {
  const [variant, setVariant] = useState<Variant>("after");
  return (
    <div className={styles.wrap}>
      <div className={styles.toggle} role="group" aria-label="Wersja">
        {(
          [
            ["before", "Obecnie"],
            ["after", "Po zmianach"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={variant === id}
            onClick={() => setVariant(id)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className={styles.scroller}>
        <div className={styles.screen}>
          {variant === "before" ? <Before /> : <After />}
        </div>
      </div>
      <ol className={styles.legend}>
        {changes.map((c) => (
          <li key={c.n}>
            <Mark n={c.n} />
            <div>
              <strong>{c.title}</strong>
              <p>{c.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Mark({ n }: { n: number }) {
  return (
    <span className={styles.mark} aria-hidden="true">
      {n}
    </span>
  );
}

function M({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className={styles.marked}>
      <Mark n={n} />
      {children}
    </div>
  );
}

function Header() {
  return (
    <header className={styles.header}>
      <span className={styles.brand}>
        <span className={styles.brandIcon}>
          <Icon name="eye" />
        </span>
        <span>
          KitCheck<span className={styles.dot}>.</span>
        </span>
      </span>
      <nav className={styles.nav}>
        <span className={styles.navActive}>
          <Icon name="shield" />
          Weryfikacja WWW
        </span>
        <span>
          <Icon name="layers" />
          Korpus źródeł
        </span>
      </nav>
    </header>
  );
}

const steps = [
  ["search", "Rozpoznanie tezy"],
  ["layers", "Zbieranie źródeł"],
  ["file", "Ocena dowodów"],
  ["shield", "Kontrola wniosku"],
] as const;

const metrics = [
  ["layers", "Materiały do analizy"],
  ["file", "Cytowane źródła"],
  ["shield", "Grupy wydawców"],
] as const;

const quote =
  "„12 marca 1999 r. Polska stała się członkiem Sojuszu Północnoatlantyckiego.”";

function Before() {
  return (
    <>
      <Header />
      <section className={styles.bIntro}>
        <div>
          <p className={styles.bEyebrow}>TWÓJ PANEL WERYFIKACJI</p>
          <h1 className={styles.bH1}>
            Mniej domysłów. <span>Więcej faktów.</span>
          </h1>
          <p className={styles.bLead}>
            Sprawdź tezę w korpusie audytowalnym oraz w bazach Google Fact Check
            i EUvsDisinfo.
          </p>
        </div>
        <div className={styles.bTrust}>
          <Icon name="shield" />
          <span>
            Dowody, które możesz
            <br />
            <strong>sprawdzić samodzielnie</strong>
          </span>
        </div>
      </section>
      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.bCardHead}>
            <span className={styles.bSymbol}>
              <Icon name="search" />
            </span>
            <span className={styles.bBadge}>NOWA WERYFIKACJA</span>
          </div>
          <h2 className={styles.bH2}>Zacznij od jednej tezy</h2>
          <p className={styles.bMuted}>
            Wpisz własną tezę lub dołącz obraz, z którego możemy ją odczytać.
          </p>
          <span className={styles.label}>Twierdzenie do sprawdzenia</span>
          <div className={styles.textarea}>{claim}</div>
          <div className={styles.bMeta}>
            <span>Jedna teza · 20–500 znaków</span>
            <span>46/500</span>
          </div>
          <div className={styles.bBox}>
            <strong>Dołącz obraz</strong>
            <span className={styles.bOptional}>opcjonalnie</span>
            <div className={styles.bNative}>
              <span>Choose file</span> No file chosen
            </div>
            <span className={styles.bTiny}>JPG, PNG lub WebP · do 4 MiB</span>
          </div>
          <div className={styles.bDate}>
            <div>
              <strong>Data wypowiedzi</strong>
              <span className={styles.bOptional}>domyślnie dzisiaj</span>
            </div>
            <div className={styles.dateBox}>dd/mm/yyyy</div>
          </div>
          <p className={styles.bTiny}>
            Nie wpisuj danych poufnych. Treść jest analizowana przez usługi AI.
          </p>
          <div className={styles.primary}>
            <Icon name="search" />
            Sprawdź dowody
          </div>
          <div className={styles.bExamplesHead}>
            <strong>Wypróbuj gotowy przykład</strong>
            <span className={styles.bBadge}>DEMO</span>
          </div>
          <div className={styles.bChips}>
            <span>✓ Potwierdzenie</span>
            <span>× Błędna data</span>
            <span>? Brak kontekstu</span>
          </div>
        </section>
        <div className={styles.col}>
          <section className={styles.card}>
            <div className={styles.bPipeHead}>
              <div>
                <span className={styles.bEyebrow}>PRZEBIEG WERYFIKACJI</span>
                <h2 className={styles.bH2s}>Przykład demonstracyjny</h2>
              </div>
              <span className={styles.bBadge}>DEMO</span>
            </div>
            <ol className={styles.bSteps}>
              {steps.map(([icon, label]) => (
                <li key={label}>
                  <span className={styles.bStepIcon}>
                    <Icon name={icon} />
                  </span>
                  <strong>{label}</strong>
                  <small>Nie wykonywano</small>
                </li>
              ))}
            </ol>
            <p className={styles.bCaption}>
              Gotowy przykład — bez wyszukiwania i analizy na żywo.
            </p>
          </section>
          <section className={styles.bMetrics}>
            {metrics.map(([icon, label]) => (
              <div key={label}>
                <span className={styles.bStepIcon}>
                  <Icon name={icon} />
                </span>
                <div>
                  <span>{label}</span>
                  <strong>2</strong>
                </div>
              </div>
            ))}
          </section>
          <section className={styles.card}>
            <div className={styles.bCardHead}>
              <span className={styles.bEyebrow}>
                <Icon name="file" />
                WYNIK WERYFIKACJI
              </span>
              <span className={styles.bBadge}>DEMO</span>
            </div>
            <div className={styles.verdict}>
              <span aria-hidden="true">✓</span>
              <h2>Potwierdzone</h2>
            </div>
            <p className={styles.bDemo}>
              Przykład demonstracyjny przygotowany ręcznie. To nie jest wynik
              bieżącej analizy AI.
            </p>
            <p className={styles.bClaim}>{claim}</p>
            <p className={styles.bExplanation}>
              Polska przystąpiła do NATO 12 marca 1999 roku. <a href="#">[1]</a>{" "}
              <a href="#">[2]</a>
            </p>
            <div className={styles.bCoverage}>
              <strong>Cytowane źródła: 2 · Grupy wydawców: 2</strong>
              <small>
                Materiały zakwalifikowane do analizy: 2. Potwierdzenie lub
                obalenie wymaga dowodów z co najmniej 2 grup. Różne domeny nie
                gwarantują niezależności informacji.
              </small>
            </div>
            <h3 className={styles.h3}>Dowody, które możesz sprawdzić</h3>
            <article className={styles.evidence}>
              <div className={styles.bEvTop}>
                <span className={styles.bRelation}>POTWIERDZA</span>
                <span>DOWÓD 1</span>
              </div>
              <blockquote>{quote}</blockquote>
              <span className={styles.bEvMeta}>
                gov.pl · Polska w NATO · dostęp 21.11.2026
              </span>
            </article>
          </section>
        </div>
      </div>
    </>
  );
}

function After() {
  return (
    <>
      <Header />
      <M n={2}>
        <section className={styles.aIntro}>
          <h1 className={styles.aH1}>Sprawdź twierdzenie</h1>
          <p className={styles.aLead}>
            Wpisz jedno zdanie. Przeszukamy korpus źródeł, Google Fact Check i
            EUvsDisinfo, a ocenę oprzemy na cytatach, które możesz sprawdzić.
          </p>
        </section>
      </M>
      <div className={styles.grid}>
        <section className={styles.card}>
          <span className={styles.aLabel}>Twierdzenie do sprawdzenia</span>
          <div className={styles.textarea}>{originalClaim}</div>
          <M n={1}>
            <div className={styles.aMeta}>
              <span>Jedno zdanie, 20–500 znaków</span>
              <span>{originalClaim.length}/500</span>
            </div>
          </M>
          <div className={styles.aField}>
            <span className={styles.aLabel}>
              Obraz <span className={styles.aOptional}>opcjonalnie</span>
            </span>
            <M n={6}>
              <div className={styles.aFile}>
                <span className={styles.aFileBtn}>Wybierz obraz</span>
                <span>Nie wybrano pliku</span>
              </div>
            </M>
            <span className={styles.aHint}>JPG, PNG lub WebP, do 4 MB</span>
          </div>
          <div className={styles.aField}>
            <M n={7}>
              <span className={styles.aLabel}>
                Data wypowiedzi{" "}
                <span className={styles.aOptional}>opcjonalnie</span>
              </span>
            </M>
            <div className={styles.dateBox}>dd.mm.rrrr</div>
          </div>
          <p className={styles.aHint}>
            Nie wpisuj danych poufnych. Treść analizują usługi AI.
          </p>
          <div className={styles.primary}>
            <Icon name="search" />
            Sprawdź dowody
          </div>
          <p className={styles.aExamplesHead}>Gotowe przykłady</p>
          <div className={styles.aChips}>
            <span>✓ Potwierdzenie</span>
            <span>× Błędna data</span>
            <span>? Brak kontekstu</span>
          </div>
        </section>
        <div className={styles.col}>
          <M n={3}>
            <section className={styles.aStrip}>
              <div className={styles.aSegments}>
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className={styles.aStripRow}>
                <span>
                  <strong>Przykład demonstracyjny</strong> · 2 materiały · 2
                  cytowane źródła · 2 grupy wydawców
                </span>
                <span className={styles.link}>Szczegóły przebiegu</span>
              </div>
            </section>
          </M>
          <section className={styles.card}>
            <M n={4}>
              <p className={styles.aDemo}>
                Przykład demonstracyjny, nie analiza na żywo
              </p>
            </M>
            <M n={5}>
              <dl className={styles.claims}>
                <div>
                  <dt>Twoja teza</dt>
                  <dd className={styles.original}>„{originalClaim}”</dd>
                </div>
                <div>
                  <dt>Sprawdzane twierdzenie</dt>
                  <dd className={styles.contextual}>
                    Polska przystąpiła do{" "}
                    <ins>Sojuszu Północnoatlantyckiego (NATO)</ins>{" "}
                    <ins>12 marca 1999 roku</ins>.
                  </dd>
                  <dd className={styles.added}>
                    <span>Dodany kontekst:</span>
                    <span className={styles.tag}>dokładna data</span>
                    <span className={styles.tag}>pełna nazwa organizacji</span>
                  </dd>
                </div>
              </dl>
            </M>
            <div className={styles.verdict}>
              <span aria-hidden="true">✓</span>
              <h2>Potwierdzone</h2>
            </div>
            <p className={styles.verdictNote}>
              Ocena dotyczy sprawdzanego twierdzenia.
            </p>
            <M n={8}>
              <p className={styles.aExplanation}>
                Polska przystąpiła do NATO 12 marca 1999 roku.{" "}
                <a href="#">[1]</a> <a href="#">[2]</a>
              </p>
            </M>
            <div className={styles.aCoverage}>
              <strong>2 cytowane źródła z 2 grup wydawców</strong>
              <p>
                Potwierdzenie lub obalenie wymaga dowodów z co najmniej 2 grup.
                Różne domeny nie gwarantują niezależności informacji.
              </p>
            </div>
            <h3 className={styles.h3}>Dowody</h3>
            <article className={styles.evidence}>
              <div className={styles.aEvTop}>
                <span className={styles.aRelation}>✓ Potwierdza</span>
                <span>Dowód 1</span>
              </div>
              <blockquote>{quote}</blockquote>
              <span className={styles.aEvMeta}>
                gov.pl · Polska w NATO · dostęp 21.11.2026
              </span>
            </article>
          </section>
        </div>
      </div>
    </>
  );
}
