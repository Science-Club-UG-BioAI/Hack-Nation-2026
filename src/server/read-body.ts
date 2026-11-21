// Bound bytes before decoding and always release the stream, including on abort.
async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  sizeError: Error,
  consume: (chunk: Uint8Array, offset: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  const reader = body.getReader();
  const cancel = () => reader.cancel().catch(() => {});
  const onAbort = () => {
    void cancel();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) return bytes;
      if (bytes + value.byteLength > maxBytes) throw sizeError;
      consume(value, bytes);
      bytes += value.byteLength;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // A producer can keep its cancellation promise pending indefinitely.
    void cancel();
    reader.releaseLock();
  }
}

export async function readBoundedBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  sizeError: Error,
  signal?: AbortSignal,
): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(maxBytes);
  const length = await readBoundedBody(
    body,
    maxBytes,
    sizeError,
    (chunk, offset) => buffer.set(chunk, offset),
    signal,
  );
  return buffer.subarray(0, length);
}

export async function readBoundedText(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  sizeError: Error,
  signal?: AbortSignal,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  await readBoundedBody(
    body,
    maxBytes,
    sizeError,
    (chunk) => {
      text += decoder.decode(chunk, { stream: true });
    },
    signal,
  );
  return text + decoder.decode();
}
