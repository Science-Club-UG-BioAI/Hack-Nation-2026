"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiErrorSchema,
  type ApiErrorBody,
  type VerificationResult,
} from "@/core/contracts";
import { VerificationView } from "./verification-view";
import { demoExamples } from "@/core/demo";
import { useVerificationRequest } from "./use-verification-request";
import { SessionControls, ensureSession } from "./session-controls";
import { AnalysisProgress, type TimedProgress } from "./analysis-progress";
import { readVerificationStream } from "@/core/progress";
import { Icon } from "./icon";
import { ImageInput, type ImageAttachment } from "./image-input";

export function Workbench() {
  const [mounted, setMounted] = useState(false);
  const [draftClaim, setClaim] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<ImageAttachment>(null);
  const imageUnread = attachment === "unread";
  const imageResult = imageUnread ? null : attachment;
  const claim = draftClaim ?? imageResult?.suggestedClaim ?? "";
  const [imageSession, setImageSession] = useState(0);
  const [statedAt, setStatedAt] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const { busy, cancel, runRequest } = useVerificationRequest();
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [events, setEvents] = useState<TimedProgress[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [demo, setDemo] = useState(false);
  const claimRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setReady(data.providers.ready))
      .catch(() => {});
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [busy]);

  const clearResult = () => {
    setResult(null);
    setError(null);
    setEvents([]);
    setCancelled(false);
  };
  async function run(demoId?: string) {
    if (!demoId && imageUnread) return;
    if (demoId) resetImage();
    clearResult();
    setElapsed(0);
    setDemo(Boolean(demoId));
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 760px)").matches)
        progressRef.current?.scrollIntoView({ block: "start" });
    });
    const started = Date.now();
    await runRequest(
      async (signal) => {
        if (!demoId) await ensureSession(signal);
        const response = await fetch(
          demoId ? `/api/demo?id=${encodeURIComponent(demoId)}` : "/api/verify",
          demoId
            ? { signal }
            : {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "text/event-stream",
                },
                body: JSON.stringify({
                  claim,
                  evidenceGraph: true,
                  ...(imageResult
                    ? { imageContext: imageResult.description }
                    : {}),
                  ...(statedAt ? { statedAt } : {}),
                }),
                signal,
              },
        );
        const showResult = (value: VerificationResult) => {
          setResult(value);
          requestAnimationFrame(() =>
            resultRef.current?.focus({
              preventScroll: !window.matchMedia("(max-width: 760px)").matches,
            }),
          );
        };
        if (
          response.ok &&
          response.headers.get("content-type")?.includes("text/event-stream") &&
          response.body
        ) {
          await readVerificationStream(response.body, (event) => {
            signal.throwIfAborted();
            if (event.type === "result") {
              showResult(event.result);
            } else if (event.type === "error")
              setError(apiErrorSchema.parse(event.error));
            else
              setEvents((previous) => [
                ...previous,
                {
                  ...event,
                  seconds: Math.floor((Date.now() - started) / 1000),
                },
              ]);
          });
          return;
        }
        const data = await response.json();
        signal.throwIfAborted();
        if (!response.ok) {
          setError(apiErrorSchema.parse(data));
          return;
        }
        showResult(data);
        if (demoId) {
          setClaim(data.claim);
          setStatedAt("");
        }
      },
      (timedOut) => {
        setError({
          code: timedOut ? "VERIFICATION_TIMEOUT" : "NETWORK_ERROR",
          requestId: "",
          retryable: true,
          message: timedOut
            ? "Analiza przekroczyła limit czasu. Możesz spróbować ponownie."
            : "Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.",
        });
      },
    );
  }
  function resetImage() {
    setAttachment(null);
    setImageSession((previous) => previous + 1);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run();
  }

  return (
    <div className="shell dashboard-shell">
      <a className="skip-link" href="#workspace">
        Przejdź do weryfikacji
      </a>
      <header className="header dashboard-header">
        <a className="brand" href="/" aria-label="KitCheck — strona główna">
          <span className="brand-icon">
            <Icon name="eye" />
          </span>
          KitCheck<span className="brand-dot">.</span>
        </a>
        <nav className="dashboard-nav" aria-label="Nawigacja główna">
          <a href="/" aria-current="page">
            <Icon name="shield" />
            Weryfikacja WWW
          </a>
          <a href="/zrodla">
            <Icon name="layers" />
            Korpus źródeł
          </a>
        </nav>
      </header>
      <main id="workspace" tabIndex={-1}>
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">TWÓJ PANEL WERYFIKACJI</p>
            <h1>
              Mniej domysłów. <span>Więcej faktów.</span>
            </h1>
            <p className="lead">
              Sprawdź tezę w korpusie audytowalnym oraz w bazach Google Fact
              Check i EUvsDisinfo.
            </p>
          </div>
          <div className="trust-note">
            <Icon name="shield" />
            <span>
              Dowody, które możesz
              <br />
              <strong>sprawdzić samodzielnie</strong>
            </span>
          </div>
        </section>
        <div className="workspace dashboard-workspace">
          <div className="input-column">
            <section className="input-card" aria-labelledby="input-title">
              <div className="card-heading">
                <span className="section-symbol">
                  <Icon name="search" />
                </span>
                <span className="text-badge">NOWA WERYFIKACJA</span>
              </div>
              <h2 id="input-title">Zacznij od jednej tezy</h2>
              <p className="muted">
                Wpisz własną tezę lub dołącz obraz, z którego możemy ją
                odczytać.
              </p>
              <form onSubmit={submit}>
                <label htmlFor="claim">Twierdzenie do sprawdzenia</label>
                <textarea
                  id="claim"
                  ref={claimRef}
                  name="claim"
                  required
                  minLength={20}
                  maxLength={500}
                  disabled={!mounted || busy}
                  value={claim}
                  onChange={(e) => {
                    setClaim(e.target.value);
                    clearResult();
                  }}
                  placeholder="Np. Polska przystąpiła do NATO 12 marca 1999 roku."
                  aria-describedby="claim-hint"
                />
                <div className="input-meta" id="claim-hint">
                  <span>
                    {draftClaim === null && imageResult?.suggestedClaim
                      ? "Teza z obrazu · możesz ją edytować"
                      : "Jedna teza · 20–500 znaków"}
                  </span>
                  <span>{claim.length}/500</span>
                </div>
                <ImageInput
                  key={imageSession}
                  disabled={!mounted || busy}
                  attachment={attachment}
                  hasClaim={Boolean(claim.trim())}
                  onChange={(value) => {
                    setAttachment(value);
                    if (value && value !== "unread")
                      setClaim((draft) => (draft?.trim() ? draft : null));
                    clearResult();
                  }}
                />
                <div className="date-row">
                  <label htmlFor="statedAt">
                    Data wypowiedzi{" "}
                    <span className="optional">domyślnie dzisiaj</span>
                  </label>
                  <input
                    id="statedAt"
                    type="date"
                    value={statedAt}
                    disabled={!mounted || busy}
                    onChange={(e) => {
                      setStatedAt(e.target.value);
                      clearResult();
                    }}
                  />
                </div>
                {ready === false && (
                  <p className="configuration-note">
                    Analiza online jest teraz niedostępna. Możesz poznać
                    działanie panelu na przykładach demo.
                  </p>
                )}
                <p className="input-privacy-hint">
                  Nie wpisuj danych poufnych. Treść jest analizowana przez
                  usługi AI.
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    !mounted || busy || imageUnread || claim.trim().length < 20
                  }
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      Sprawdzanie…
                    </>
                  ) : (
                    <>
                      <Icon name="search" />
                      Sprawdź dowody
                    </>
                  )}
                </button>
                {busy && (
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      cancel();
                      setCancelled(true);
                      requestAnimationFrame(() => claimRef.current?.focus());
                    }}
                  >
                    Anuluj analizę
                  </button>
                )}
              </form>
              <div className="examples">
                <p>
                  Wypróbuj gotowy przykład <span>DEMO</span>
                </p>
                <div>
                  {demoExamples.map((example, index) => (
                    <button
                      disabled={!mounted || busy}
                      className={`example-button example-${index}`}
                      key={example.id}
                      onClick={() => void run(example.id)}
                    >
                      <span aria-hidden="true">
                        {index === 0 ? "✓" : index === 1 ? "×" : "?"}
                      </span>
                      {example.label}
                    </button>
                  ))}
                </div>
                <small>
                  Przygotowane przykłady, bez bieżącego wyszukiwania.
                </small>
              </div>
            </section>
            <SessionControls
              onClear={() => {
                cancel();
                setClaim(null);
                resetImage();
                setStatedAt("");
                clearResult();
              }}
            />
          </div>
          <div className="analysis-column" ref={progressRef}>
            <AnalysisProgress
              events={events}
              busy={busy}
              elapsed={elapsed}
              result={result}
              interrupted={cancelled || Boolean(error)}
              demo={demo}
            />
            <section
              className="analysis-metrics"
              aria-label="Podsumowanie materiałów"
            >
              <div>
                <span className="metric-icon">
                  <Icon name="layers" />
                </span>
                <div>
                  <span>Materiały do analizy</span>
                  <strong>{result?.sources.length ?? "—"}</strong>
                </div>
              </div>
              <div>
                <span className="metric-icon">
                  <Icon name="file" />
                </span>
                <div>
                  <span>Cytowane źródła</span>
                  <strong>{result?.coverage?.citedSources ?? "—"}</strong>
                </div>
              </div>
              <div>
                <span className="metric-icon">
                  <Icon name="shield" />
                </span>
                <div>
                  <span>Grupy wydawców</span>
                  <strong>{result?.coverage?.publisherGroups ?? "—"}</strong>
                </div>
              </div>
            </section>
            <section
              className={`result-card ${result ? "has-result" : ""}`}
              ref={resultRef}
              tabIndex={-1}
              aria-labelledby="result-title"
              aria-busy={busy}
            >
              <div className="card-heading">
                <span className="eyebrow">
                  <Icon name="file" />
                  WYNIK WERYFIKACJI
                </span>
                <span className="text-badge">
                  {result?.mode === "demo"
                    ? "DEMO"
                    : result
                      ? "RAPORT"
                      : busy
                        ? "W PRZYGOTOWANIU"
                        : "CZEKA NA TEZĘ"}
                </span>
              </div>
              {error ? (
                <div className="error-panel" role="alert">
                  <h2 id="result-title">Nie udało się ukończyć analizy</h2>
                  <p>{error.message}</p>
                  <p className="muted">
                    Błąd techniczny nie oznacza, że twierdzenie jest fałszywe.
                  </p>
                  {error.retryable && (
                    <button
                      className="example-button"
                      disabled={!mounted || busy}
                      onClick={() => void run()}
                    >
                      Spróbuj ponownie
                    </button>
                  )}
                  <small>
                    {error.code}
                    {error.requestId && ` · ${error.requestId}`}
                  </small>
                </div>
              ) : result ? (
                <VerificationView key={result.requestId} result={result} />
              ) : (
                <div className="empty-result">
                  <div
                    className={`empty-illustration ${busy ? "is-analyzing" : ""}`}
                    aria-hidden="true"
                  >
                    <span className="illustration-line line-one" />
                    <span className="illustration-line line-two" />
                    <span className="empty-icon">
                      <Icon name={busy ? "activity" : "shield"} />
                    </span>
                    <span className="illustration-check">
                      <Icon name="check" />
                    </span>
                  </div>
                  <h2 id="result-title">
                    {busy
                      ? "Sprawdzamy. Ty widzisz, jak."
                      : cancelled
                        ? "Analiza została anulowana"
                        : "Każdy wniosek ma swoje źródło."}
                  </h2>
                  <p>
                    {busy
                      ? "Śledź kolejne etapy powyżej. Wynik pojawi się po zakończeniu kontroli."
                      : cancelled
                        ? "Możesz poprawić tezę lub rozpocząć sprawdzenie ponownie."
                        : "Tutaj znajdziesz ocenę tezy, konkretne cytaty i linki do materiałów, na których oparto wniosek."}
                  </p>
                  <div className="verdict-legend" aria-label="Legenda wyników">
                    <span className="legend-supported">✓ Potwierdzone</span>
                    <span className="legend-uncertain">
                      ? Niepewne / kontekst
                    </span>
                    <span className="legend-refuted">× Fałszywe</span>
                  </div>
                  <p className="empty-footnote">
                    Brak wystarczających dowodów nie oznacza fałszu.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
        <footer className="page-footer">
          <span>KitCheck · HackNation 2026</span>
          <p>Sprawdzaj źródła. Zachowaj własny osąd.</p>
        </footer>
      </main>
    </div>
  );
}
