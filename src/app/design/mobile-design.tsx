"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Icon } from "@/components/icon";
import styles from "./design.module.css";
import { ReadabilityCompare } from "./readability";

type View = "form" | "running" | "result";

const views: { id: View; label: string }[] = [
  { id: "form", label: "Formularz" },
  { id: "running", label: "W trakcie" },
  { id: "result", label: "Wynik" },
];

const steps = [
  "Rozpoznanie tezy",
  "Zbieranie źródeł",
  "Ocena dowodów",
  "Kontrola wniosku",
];

const claim = "Polska weszła do NATO w 1999.";

const maxImageBytes = 10 * 1024 * 1024;

type Attachment = { url: string; name: string; size: number };

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function ImageIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}

export function MobileDesign() {
  const [view, setView] = useState<View>("running");
  const [image, setImage] = useState<Attachment | null>({
    url: "/design/kot.svg",
    name: "kot-na-parapecie.jpg",
    size: 2_480_000,
  });
  useEffect(() => {
    if (!image?.url.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);
  const [section, setSection] = useState<"layout" | "readability">(
    "readability",
  );
  const sectionSwitch = (
    <div className={styles.sections} role="group" aria-label="Makieta">
      <button
        type="button"
        aria-pressed={section === "layout"}
        onClick={() => setSection("layout")}
      >
        Układ mobilny
      </button>
      <button
        type="button"
        aria-pressed={section === "readability"}
        onClick={() => setSection("readability")}
      >
        Desktop: przed i po
      </button>
    </div>
  );
  if (section === "readability")
    return (
      <div className={styles.page}>
        {sectionSwitch}
        <ReadabilityCompare />
      </div>
    );
  return (
    <div className={styles.page}>
      {sectionSwitch}
      <div className={styles.switcher} role="group" aria-label="Stan makiety">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className={styles.frame}>
        <header className={styles.top}>
          <a className={styles.brand} href="/">
            <span className={styles.brandIcon}>
              <Icon name="eye" />
            </span>
            <span>
              KitCheck<span className={styles.dot}>.</span>
            </span>
          </a>
          <button type="button" className={styles.menu}>
            Menu
          </button>
        </header>
        {view === "form" ? (
          <FormState image={image} onImage={setImage} />
        ) : (
          <FocusState view={view} image={image} />
        )}
      </div>
    </div>
  );
}

function FormState({
  image,
  onImage,
}: {
  image: Attachment | null;
  onImage: (image: Attachment | null) => void;
}) {
  const [error, setError] = useState("");
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Ten plik nie jest zdjęciem. Wybierz JPG, PNG lub WebP.");
      return;
    }
    if (file.size > maxImageBytes) {
      setError(`Zdjęcie ma ${formatSize(file.size)}. Wybierz plik do 10 MB.`);
      return;
    }
    setError("");
    onImage({
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    });
  }
  return (
    <main className={styles.body}>
      <h1 className={styles.h1}>Sprawdź tezę</h1>
      <p className={styles.lead}>
        Znajdziemy źródła i pokażemy cytaty, na których opiera się wynik.
      </p>
      <form className={styles.card} onSubmit={(e) => e.preventDefault()}>
        <label className={styles.label} htmlFor="d-claim">
          Twierdzenie do sprawdzenia
        </label>
        <textarea
          id="d-claim"
          className={styles.textarea}
          defaultValue={claim}
          aria-describedby="d-claim-hint"
        />
        <div className={styles.meta} id="d-claim-hint">
          <span>Jedna teza · 20–500 znaków</span>
          <span>{claim.length}/500</span>
        </div>
        <label className={styles.label} htmlFor="d-date">
          Data wypowiedzi <span className={styles.optional}>opcjonalnie</span>
        </label>
        <input id="d-date" type="date" className={styles.date} />
        <div className={styles.attach}>
          <span className={styles.label} id="d-image-label">
            Zdjęcie lub zrzut ekranu{" "}
            <span className={styles.optional}>opcjonalnie</span>
          </span>
          {image ? (
            <div className={styles.attached}>
              <img src={image.url} alt="Podgląd załączonego zdjęcia" />
              <div>
                <span className={styles.fileName}>{image.name}</span>
                <span className={styles.fileSize}>
                  {formatSize(image.size)}
                </span>
              </div>
              <button
                type="button"
                className={styles.link}
                onClick={() => onImage(null)}
              >
                Usuń
              </button>
            </div>
          ) : (
            <label className={styles.dropzone}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={styles.srOnly}
                aria-labelledby="d-image-label"
                aria-describedby="d-image-hint"
                onChange={pick}
              />
              <ImageIcon />
              <span>Dodaj zdjęcie</span>
            </label>
          )}
          <p className={styles.hint} id="d-image-hint">
            Np. zrzut ekranu posta. JPG, PNG lub WebP, do 10 MB.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <p className={styles.privacy}>
          Nie wpisuj danych poufnych. Treść analizują usługi AI.
        </p>
        <button type="submit" className={styles.primary}>
          <Icon name="search" />
          Sprawdź dowody
        </button>
      </form>
      <p className={styles.note}>
        Po kliknięciu formularz zwija się do jednej linii, a postęp i wynik
        mieszczą się na jednym ekranie.
      </p>
    </main>
  );
}

function FocusState({
  view,
  image,
}: {
  view: "running" | "result";
  image: Attachment | null;
}) {
  const running = view === "running";
  const current = 1;
  return (
    <>
      <div className={styles.sticky}>
        <section className={styles.claimBar} aria-label="Sprawdzana teza">
          {image && (
            <img
              className={styles.thumb}
              src={image.url}
              alt="Załączone zdjęcie"
            />
          )}
          <div>
            <p className={styles.originalLine}>
              <span>Twoja teza:</span> „{claim}”
            </p>
            <span className={styles.kicker}>
              {running ? "Sprawdzamy twierdzenie" : "Sprawdzane twierdzenie"}
            </span>
            <p className={styles.claimText}>
              Polska przystąpiła do{" "}
              <ins>Sojuszu Północnoatlantyckiego (NATO)</ins>{" "}
              <ins>12 marca 1999 roku</ins>.
            </p>
          </div>
          <button type="button" className={styles.link}>
            {running ? "Anuluj" : "Zmień"}
          </button>
        </section>
        <section
          className={`${styles.progress} ${running ? "" : styles.progressDone}`}
          aria-label="Przebieg weryfikacji"
        >
          {running && (
            <div className={styles.progressHead}>
              <strong aria-live="polite">{steps[current]}</strong>
              <span>krok {current + 1} z 4 · 12 s</span>
            </div>
          )}
          <ol className={styles.segments}>
            {steps.map((step, i) => {
              const state =
                !running || i < current
                  ? "done"
                  : i === current
                    ? "active"
                    : "todo";
              return (
                <li
                  key={step}
                  className={styles[state]}
                  aria-current={running && i === current ? "step" : undefined}
                >
                  <span className={styles.srOnly}>
                    {step}:{" "}
                    {state === "done"
                      ? "zakończono"
                      : state === "active"
                        ? "w trakcie"
                        : "oczekuje"}
                  </span>
                </li>
              );
            })}
          </ol>
          {!running && (
            <details className={styles.details}>
              <summary>
                <span>4 z 4 etapów · 34 s</span>
                <span className={styles.summaryLink}>Szczegóły</span>
              </summary>
              <ul className={styles.sources}>
                <SourceRow name="Wyszukiwarka WWW" state="Materiały: 6" ok />
                <SourceRow name="Wikipedia" state="Materiały: 2" ok />
                <SourceRow name="Sejm / ELI" state="Materiały: 1" ok />
                <SourceRow name="arXiv" state="Nie wybrano" />
              </ul>
            </details>
          )}
        </section>
      </div>
      <main className={styles.body}>
        {running ? (
          <>
            <section className={styles.card} aria-label="Źródła">
              <h2 className={styles.cardTitle}>Źródła</h2>
              <ul className={styles.sources}>
                <SourceRow name="Wyszukiwarka WWW" state="Materiały: 6" ok />
                <SourceRow name="Wikipedia" state="Pobieranie…" />
                <SourceRow name="Sejm / ELI" state="Pobieranie…" />
              </ul>
            </section>
            <div className={styles.placeholder}>
              <Icon name="clock" />
              <p>
                Tu pojawi się wynik.
                <br />
                Zwykle 30–60 s.
              </p>
            </div>
          </>
        ) : (
          <section className={styles.card} aria-labelledby="d-verdict">
            <div className={styles.verdict}>
              <span aria-hidden="true">✓</span>
              <h2 id="d-verdict">Potwierdzone</h2>
            </div>
            <p className={styles.verdictNote}>
              Ocena dotyczy sprawdzanego twierdzenia.
            </p>
            <p className={styles.counts}>
              9 materiałów · 3 cytowane źródła · 2 grupy wydawców
            </p>
            <p className={styles.explanation}>
              Dwa niezależne źródła podają tę samą datę przystąpienia Polski do
              NATO.
            </p>
            <ol className={styles.evidence}>
              <li>
                <blockquote>
                  „12 marca 1999 r. Polska stała się członkiem Sojuszu
                  Północnoatlantyckiego.”
                </blockquote>
                <span className={styles.src}>
                  <span className={styles.relation}>Potwierdza</span>
                  <a href="#">gov.pl · Polska w NATO</a>
                </span>
              </li>
              <li>
                <blockquote>
                  „Polska, Czechy i Węgry przystąpiły do NATO 12 marca 1999
                  roku.”
                </blockquote>
                <span className={styles.src}>
                  <span className={styles.relation}>Potwierdza</span>
                  <a href="#">Wikipedia · Rozszerzenie NATO</a>
                </span>
              </li>
            </ol>
          </section>
        )}
      </main>
    </>
  );
}

function SourceRow({
  name,
  state,
  ok = false,
}: {
  name: string;
  state: string;
  ok?: boolean;
}) {
  return (
    <li>
      <span>{name}</span>
      <span className={ok ? styles.ok : styles.muted}>{state}</span>
    </li>
  );
}
