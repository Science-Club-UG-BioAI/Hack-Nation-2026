import { expect, it, vi } from "vitest";
import { readBoundedText } from "@/server/read-body";

it("decodes UTF-8 split across chunks and accepts exactly the byte limit", async () => {
  const bytes = new TextEncoder().encode("Zażółć gęślą");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  await expect(
    readBoundedText(stream, bytes.length, new Error("too large")),
  ).resolves.toBe("Zażółć gęślą");
  expect(stream.locked).toBe(false);
});

it("enforces the byte limit and preserves the original error if cancellation fails", async () => {
  const cancel = vi.fn().mockRejectedValue(new Error("cleanup failed"));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("ąż"));
    },
    cancel,
  });
  const error = new Error("too large");
  await expect(readBoundedText(stream, 3, error)).rejects.toBe(error);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(stream.locked).toBe(false);
});

it("cancels a stalled read and releases its lock", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  const controller = new AbortController();
  const pending = readBoundedText(
    stream,
    100,
    new Error("too large"),
    controller.signal,
  );
  const reason = new Error("cancelled");
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(stream.locked).toBe(false);
});

it("reports the byte limit even when the producer never finishes cancellation", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.of(1, 2));
    },
    cancel: () => new Promise<void>(() => {}),
  });
  const error = new Error("too large");
  await expect(readBoundedText(stream, 1, error)).rejects.toBe(error);
  expect(stream.locked).toBe(false);
});
