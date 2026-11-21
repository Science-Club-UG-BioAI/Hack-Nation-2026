import { useEffect, useRef, useState } from "react";

// Both workbenches allow one active request. Superseded requests must never
// publish results or clear the busy state of their replacement.
export function useVerificationRequest() {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );

  function cancel() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
  }

  async function runRequest(
    work: (signal: AbortSignal) => Promise<void>,
    onError: (timedOut: boolean) => void,
  ) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    const timer = setTimeout(() => controller.abort("timeout"), 65_000);
    try {
      await work(controller.signal);
      controller.signal.throwIfAborted();
    } catch {
      if (active.current === controller)
        onError(controller.signal.reason === "timeout");
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, cancel, runRequest };
}
