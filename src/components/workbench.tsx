"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiErrorSchema,
  type ApiErrorBody,
  type VerificationResult,
} from "@/core/contracts";
import { VerificationView } from "./verification-view";
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
  async function run() {
    if (imageUnread || !claim.trim()) return;
    clearResult();
    setElapsed(0);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 760px)").matches)
        progressRef.current?.scrollIntoView({ block: "start" });
    });
    const started = Date.now();
    await runRequest(
      async (signal) => {
        await ensureSession(signal);
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            claim,
            evidenceGraph: true,
            ...(imageResult ? { imageContext: imageResult.description } : {}),
            ...(statedAt ? { statedAt } : {}),
          }),
          signal,
        });
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
        <div className="workspace dashboard-workspace">
          <div className="input-column">
            <h1 id="input-title">Sprawdź tezę</h1>
            <section className="input-card" aria-labelledby="input-title">
              <form onSubmit={submit}>
                <label htmlFor="claim">Twierdzenie do sprawdzenia</label>
                <textarea
                  id="claim"
                  ref={claimRef}
                  name="claim"
                  required
                  maxLength={500}
                  disabled={!mounted || busy}
                  value={claim}
                  onChange={(e) => {
                    setClaim(e.target.value);
                    clearResult();
                  }}
                  aria-describedby="claim-hint"
                />
                <div className="input-meta" id="claim-hint">
                  {draftClaim === null && imageResult?.suggestedClaim && (
                    <span>Teza z obrazu · możesz ją edytować</span>
                  )}
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
                <details className="form-options">
                  <summary>
                    Zmień datę wypowiedzi · {statedAt || "dziś"}
                  </summary>
                  <div className="date-row">
                    <label htmlFor="statedAt">Data wypowiedzi</label>
                    <input
                      id="statedAt"
                      type="date"
                      value={statedAt}
                      disabled={!mounted || busy}
                      onChange={(event) => {
                        setStatedAt(event.target.value);
                        clearResult();
                      }}
                    />
                  </div>
                </details>
                {ready === false && (
                  <p className="configuration-note">
                    Analiza online jest teraz niedostępna.
                  </p>
                )}
                <p className="input-privacy-hint">
                  Nie wpisuj danych poufnych. Treść jest analizowana przez
                  usługi AI.
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!mounted || busy || imageUnread || !claim.trim()}
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
              </form>
            </section>
          </div>
          <div className="analysis-column" ref={progressRef}>
            {busy && (
              <AnalysisProgress
                events={events}
                busy
                elapsed={elapsed}
                result={null}
                interrupted={false}
                onCancel={() => {
                  cancel();
                  setCancelled(true);
                  requestAnimationFrame(() => claimRef.current?.focus());
                }}
              />
            )}
            <section
              className={`result-card ${result ? "has-result" : ""}`}
              hidden={!result && !error && !cancelled}
              ref={resultRef}
              tabIndex={-1}
              aria-labelledby="result-title"
              aria-busy={busy}
            >
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
                <VerificationView
                  key={result.requestId}
                  result={result}
                  onRetry={() => void run()}
                />
              ) : (
                <div>
                  <h2 id="result-title">Analiza została anulowana</h2>
                  <p>Możesz rozpocząć sprawdzenie ponownie.</p>
                </div>
              )}
            </section>
            {!busy && events.length > 0 && (
              <AnalysisProgress
                events={events}
                busy={false}
                elapsed={elapsed}
                result={result}
                interrupted={cancelled || Boolean(error)}
              />
            )}
          </div>
        </div>
        <footer className="page-footer">
          <span>KitCheck · HackNation 2026</span>
          <details className="session-options">
            <summary>Prywatność i dane sesji</summary>
            <SessionControls
              onClear={() => {
                cancel();
                setClaim(null);
                resetImage();
                setStatedAt("");
                clearResult();
              }}
            />
          </details>
        </footer>
      </main>
    </div>
  );
}
