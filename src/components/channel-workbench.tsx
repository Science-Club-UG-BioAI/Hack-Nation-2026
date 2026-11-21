"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiErrorSchema,
  type ApiErrorBody,
  type ChannelReply,
} from "@/core/contracts";
import { VerificationView } from "./verification-view";
import { SessionControls, ensureSession } from "./session-controls";

export function ChannelWorkbench() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [content, setContent] = useState("");
  const [statedAt, setStatedAt] = useState("");
  const [sent, setSent] = useState("");
  const [reply, setReply] = useState<ChannelReply | null>(null);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setReply(null);
    setError(null);
    setSent(content);
    const timer = setTimeout(() => controller.abort("timeout"), 65_000);
    try {
      await ensureSession(controller.signal);
      const response = await fetch("/api/channels/discord-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, ...(statedAt ? { statedAt } : {}) }),
        signal: controller.signal,
      });
      const data = await response.json();
      controller.signal.throwIfAborted();
      if (active.current !== controller) return;
      if (!response.ok) setError(apiErrorSchema.parse(data));
      else setReply(data);
    } catch {
      if (
        active.current !== controller ||
        controller.signal.reason === "cancelled"
      )
        return;
      setError({
        status: "technical_error",
        requestId: "",
        code: "CONNECTION_ERROR",
        retryable: true,
        message: controller.signal.aborted
          ? "Przekroczono czas oczekiwania na odpowiedź. Nie wydano werdyktu."
          : "Nie udało się odebrać odpowiedzi. Sprawdź połączenie i spróbuj ponownie.",
      });
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="shell">
      <header className="header">
        <a className="brand" href="/">
          Prawdowid<span className="brand-dot">.</span>
        </a>
        <a href="/" className="text-button">
          Weryfikacja WWW
        </a>
      </header>
      <main className="channel-main">
        <p className="eyebrow">DRUGI KANAŁ · ADAPTER DEMONSTRACYJNY</p>
        <h1>Sprawdzenie przez wiadomość.</h1>
        <p className="lead">
          Symulator rozmowy Discord. Wpisz wiadomość — Prawdowid automatycznie
          wyszuka dowody i przygotuje odpowiedź.
        </p>
        <p className="demo-notice">
          Symulujemy odbiór i odpowiedź w komunikatorze. Nie łączymy się z
          Discordem i nie wysyłamy wiadomości do innych osób. Analiza korzysta z
          rzeczywistych usług, tak jak WWW.
        </p>
        <div className="channel-grid">
          <section className="input-card">
            <h2>Napisz do Prawdowida</h2>
            <form onSubmit={submit}>
              <label htmlFor="message">Treść wiadomości</label>
              <textarea
                id="message"
                minLength={20}
                maxLength={500}
                required
                disabled={!mounted || busy}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Np. Polska przystąpiła do NATO 12 marca 1999 roku."
              />
              <div className="input-meta">
                <span>Jedna teza · 20–500 znaków</span>
                <span>{content.length}/500</span>
              </div>
              <label htmlFor="message-date">
                Data wypowiedzi (opcjonalnie)
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
                {busy ? "Prawdowid sprawdza…" : "Wyślij w symulatorze"}
              </button>
            </form>
            <SessionControls
              onClear={() => {
                active.current?.abort("cancelled");
                active.current = null;
                setBusy(false);
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
                onClick={() => active.current?.abort("cancelled")}
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
                  Prawdowid wyszukuje źródła i sprawdza dowody…
                </p>
              )}
              {error && (
                <div className="message message-bot" role="alert">
                  <strong>Prawdowid · błąd techniczny</strong>
                  <p>{error.message}</p>
                  <p>Nie wydano werdyktu o prawdziwości.</p>
                </div>
              )}
              {reply?.messages.map((message, index) => (
                <div
                  className="message message-bot"
                  key={`${reply.result.requestId}-${index}`}
                >
                  <strong>Prawdowid · odpowiedź {index + 1}</strong>
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
