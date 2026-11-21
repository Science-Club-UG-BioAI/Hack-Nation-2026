// Bound bytes before decoding and always release the stream, including on abort.
export async function readBoundedText(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  sizeError: Error,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const reader = body.getReader();
  const cancel = () => reader.cancel().catch(() => {});
  const onAbort = () => {
    void cancel();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) throw sizeError;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // A producer can keep its cancellation promise pending indefinitely.
    void cancel();
    reader.releaseLock();
  }
}
