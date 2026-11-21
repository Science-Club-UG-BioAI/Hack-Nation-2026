"use client";
import { useEffect, useRef, useState } from "react";
import { PRIVACY_NOTICE } from "@/core/privacy";

export async function ensureSession(signal: AbortSignal) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "x-prawdowid-action": "start-session" },
    signal,
  });
  if (!response.ok) throw new Error("Session unavailable");
}

export function SessionControls({ onClear }: { onClear: () => void }) {
  const callback = useRef(onClear);
  const broadcast = useRef<BroadcastChannel | null>(null);
  callback.current = onClear;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const channel = new BroadcastChannel("prawdowid-session");
    broadcast.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === "deleted") {
        callback.current();
        setMessage("Sesja została usunięta w innej karcie.");
      }
    };
    // Back/forward navigation must not resurrect an erased UI snapshot.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) callback.current();
    };
    window.addEventListener("pageshow", restore);
    return () => {
      broadcast.current = null;
      channel.close();
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  async function erase() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/session", {
        method: "DELETE",
        headers: { "x-prawdowid-action": "delete-session" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Deletion failed");
      callback.current();
      broadcast.current?.postMessage({ type: "deleted" });
      setMessage(
        "Usunięto lokalny zapis i wyniki sesji w obu kanałach. Usunięcie nie obejmuje danych już przesłanych do dostawców usług ani pobranych eksportów.",
      );
    } catch {
      setMessage(
        "Nie udało się potwierdzić usunięcia sesji. Spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="session-controls" aria-label="Prywatność i zapis sesji">
      <p className="privacy-note">{PRIVACY_NOTICE}</p>
      <a className="text-button" href="/api/session" download>
        Pobierz zapis sesji
      </a>
      {" · "}
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={() => void erase()}
      >
        {busy ? "Usuwanie…" : "Usuń sesję i jej zapis"}
      </button>
      <p role="status">{message}</p>
    </aside>
  );
}
