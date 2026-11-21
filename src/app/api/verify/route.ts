import type { NextRequest } from "next/server";
import { handleVerification } from "@/server/handle-verification";
import type { VerificationEvent } from "@/core/progress";
import { sessionId } from "@/server/request-session";
export const runtime = "nodejs";
export const maxDuration = 65;
export function POST(request: NextRequest) {
  // JSON clients and the Discord adapter retain their existing HTTP contract.
  // Streaming clients establish the session before starting, so no late cookie is lost.
  if (
    !request.headers.get("accept")?.includes("text/event-stream") ||
    !sessionId(request)
  )
    return handleVerification(request, "web");
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: VerificationEvent) => {
        if (!closed && !signal.aborted)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
      };
      try {
        const response = await handleVerification(request, "web", send, signal);
        const body = await response.json();
        send(
          response.ok
            ? { type: "result", result: body }
            : { type: "error", error: body },
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "verification_stream_failed",
            errorType: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        send({
          type: "error",
          error: {
            code: "NETWORK_ERROR",
            requestId: "",
            retryable: true,
            message: "Przerwano połączenie z analizą. Spróbuj ponownie.",
          },
        });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
