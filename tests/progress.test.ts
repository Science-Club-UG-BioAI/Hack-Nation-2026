import { describe, expect, it } from "vitest";
import {
  readVerificationStream,
  type VerificationEvent,
} from "@/core/progress";

describe("verification event transport", () => {
  it("decodes frames split inside Polish UTF-8 characters and keeps event order", async () => {
    const events: VerificationEvent[] = [
      { type: "stage", stage: "searching" },
      {
        type: "error",
        error: {
          code: "PROVIDER_ERROR",
          message: "Źródło niedostępne — spróbuj ponownie.",
          requestId: "fixture",
          retryable: true,
        },
      },
    ];
    const bytes = new TextEncoder().encode(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    const received: VerificationEvent[] = [];
    await readVerificationStream(stream, (event) => received.push(event));
    expect(received).toEqual(events);
  });
  it("treats a dropped connection as a failure, never a completed verification", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"stage","stage":"planning"}\n\n',
          ),
        );
        controller.close();
      },
    });
    await expect(readVerificationStream(stream, () => {})).rejects.toThrow(
      "without a result",
    );
  });
});

it("delivers a terminal event without waiting for the producer to acknowledge cancellation", async () => {
  const event: VerificationEvent = {
    type: "error",
    error: {
      code: "NETWORK_ERROR",
      message: "offline",
      retryable: true,
      requestId: "",
    },
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode("data: " + JSON.stringify(event) + "\n\n"),
      );
    },
    cancel: () => new Promise<void>(() => {}),
  });
  const received: VerificationEvent[] = [];
  await readVerificationStream(stream, (item) => received.push(item));
  expect(received).toEqual([event]);
  expect(stream.locked).toBe(false);
});
