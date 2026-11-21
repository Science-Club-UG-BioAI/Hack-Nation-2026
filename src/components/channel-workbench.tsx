"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiErrorSchema,
  type ApiErrorBody,
  type ChannelReply,
} from "@/core/contracts";
import { VerificationView } from "./verification-view";
import { useVerificationRequest } from "./use-verification-request";
import { SessionControls, ensureSession } from "./session-controls";

export function ChannelWorkbench() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [content, setContent] = useState("");
  const [statedAt, setStatedAt] = useState("");
  const [sent, setSent] = useState("");
  const [reply, setReply] = useState<ChannelReply | null>(null);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const { busy, cancel, runRequest } = useVerificationRequest();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setReply(null);
    setError(null);
    setSent(content);
    await runRequest(
      async (signal) => {
        await ensureSession(signal);
        const response = await fetch("/api/channels/discord-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, ...(statedAt ? { statedAt } : {}) }),
          signal,
        });
        const data = await response.json();
        signal.throwIfAborted();
        if (!response.ok) setError(apiErrorSchema.parse(data));
        else setReply(data);
      },
      (timedOut) => {
        setError({
          status: "technical_error",
          requestId: "",
          code: "CONNECTION_ERROR",
          retryable: true,
          message: timedOut
            ? "Przekroczono czas oczekiwania na odpowiedź. Nie wydano werdyktu."
            : "Nie udało się odebrać odpowiedzi. Sprawdź połączenie i spróbuj ponownie.",
        });
      },
    );
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#channel-workspace">
        Przejdź do formularza wiadomości
      </a>
      <header className="header">
        <a className="brand" href="/">
          KitCheck<span className="brand-dot">.</span>
        </a>
        <a href="/" className="text-button">
          Weryfikacja WWW
        </a>
      </header>
      <main id="channel-workspace" tabIndex={-1} className="channel-main">
        <p className="eyebrow">DRUGI KANAŁ · ADAPTER DEMONSTRACYJNY</p>
        <h1>Sprawdzenie przez wiadomość.</h1>
        <p className="lead">
          Symulator rozmowy Discord. Wpisz wiadomość — KitCheck automatycznie
          wyszuka dowody i przygotuje odpowiedź.
        </p>
        <p className="demo-notice">
          Symulujemy odbiór i odpowiedź w komunikatorze. Nie łączymy się z
          Discordem i nie wysyłamy wiadomości do innych osób. Analiza korzysta z
          rzeczywistych usług, tak jak WWW.
        </p>
        <div className="channel-grid">
          <section className="input-card">
            <h2>Napisz wiadomość do KitCheck</h2>
            <form onSubmit={submit}>
              <label htmlFor="message">Treść wiadomości</label>
              <textarea
                id="message"
                ref={inputRef}
                aria-describedby="message-hint"
                minLength={20}
                maxLength={500}
                required
                disabled={!mounted || busy}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Np. Polska przystąpiła do NATO 12 marca 1999 roku."
              />
              <div className="input-meta" id="message-hint">
                <span>Jedna teza · 20–500 znaków</span>
                <span>{content.length}/500</span>
              </div>
              <label htmlFor="message-date">
                Data wypowiedzi (domyślnie dzisiaj)
              </label>
              <input
                id="message-date"
                type="date"
                value={statedAt}
                disabled={!mounted || busy}
                onChange={(e) => setStatedAt(e.target.value)}
              />
              <button
                type="submit"
                className="primary-button"
                disabled={!mounted || busy || content.trim().length < 20}
              >
                {busy ? "KitCheck sprawdza…" : "Wyślij w symulatorze"}
              </button>
            </form>
            <SessionControls
              onClear={() => {
                cancel();
                setContent("");
                setStatedAt("");
                setSent("");
                setReply(null);
                setError(null);
              }}
            />
            {busy && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  cancel();
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                Anuluj
              </button>
            )}
          </section>
          <section
            className="result-card chat-panel"
            aria-label="Rozmowa demonstracyjna"
          >
            <h2>Rozmowa demonstracyjna</h2>
            <div role="log" aria-live="polite" aria-relevant="additions text">
              {!sent && (
                <p className="muted">
                  Odpowiedź pojawi się tutaj automatycznie. Nie musisz kopiować
                  wyniku z WWW.
                </p>
              )}
              {sent && (
                <div className="message message-user">
                  <strong>Ty</strong>
                  <p>{sent}</p>
                </div>
              )}
              {busy && (
                <p role="status">
                  KitCheck wyszukuje źródła i sprawdza dowody…
                </p>
              )}
              {error && (
                <div className="message message-bot" role="alert">
                  <strong>KitCheck · błąd techniczny</strong>
                  <p>{error.message}</p>
                  <p>Nie wydano werdyktu o prawdziwości.</p>
                </div>
              )}
              {reply?.messages.map((message, index) => (
                <div
                  className="message message-bot"
                  key={`${reply.result.requestId}-${index}`}
                >
                  <strong>KitCheck · odpowiedź {index + 1}</strong>
                  <p>{message}</p>
                </div>
              ))}
            </div>
            {reply && (
              <details className="channel-result">
                <summary>Pełny wynik i klikalne źródła</summary>
                <VerificationView
                  key={reply.result.requestId}
                  result={reply.result}
                />
              </details>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
