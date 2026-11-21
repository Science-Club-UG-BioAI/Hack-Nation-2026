import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyInputSchema, channelInputSchema } from "@/core/contracts";
import { AppError } from "@/core/errors";
import { numberSetting, requireConfiguration } from "@/server/config";
import { runVerification } from "./verification-service";
import { channelReply } from "@/core/channel";
import { readBoundedText } from "@/server/read-body";
import { assertSessionActive, writeAudit } from "./audit-store";
import type { VerifyInput } from "@/core/contracts";
import type { ProgressListener } from "@/core/progress";

export async function handleVerification(
  request: NextRequest,
  channel: "web" | "discord_demo",
  onProgress?: ProgressListener,
  transportSignal?: AbortSignal,
) {
  const requestId = randomUUID();
  const start = Date.now();
  const controller = new AbortController();
  // Keep Next's original HTTP request/body. Reconstructing a NextRequest from
  // the framework wrapper can fail before validation in the running server.
  const signal = AbortSignal.any([
    request.signal,
    controller.signal,
    ...(transportSignal ? [transportSignal] : []),
  ]);
  let timedOut = false;
  let acceptedInput: VerifyInput | undefined;
  let auditAttempted = false;
  let deleted = false;
  const timeoutMs = numberSetting("VERIFY_TIMEOUT_MS", 60_000, 60_000);
  const deadlineAt = start + timeoutMs;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const existing = request.cookies.get("prawdowid-session")?.value;
  const session =
    existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : randomUUID();
  const respond = (body: unknown, status: number) => {
    const response = NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    });
    if (!deleted)
      response.cookies.set("prawdowid-session", session, {
        httpOnly: true,
        sameSite: "strict",
        secure: request.nextUrl.protocol === "https:",
        maxAge: 86400,
        path: "/",
      });
    return response;
  };
  try {
    const origin = request.headers.get("origin");
    // Next.js can normalize 127.0.0.1 to localhost in nextUrl. Compare the
    // browser origin with the actual Host header, not the normalized URL.
    let sameOrigin = true;
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        sameOrigin =
          parsedOrigin.protocol === request.nextUrl.protocol &&
          parsedOrigin.host ===
            (request.headers.get("host") || request.nextUrl.host);
      } catch {
        sameOrigin = false;
      }
    }
    if (!sameOrigin)
      throw new AppError(
        "INPUT_INVALID",
        "Żądanie pochodzi z innej witryny.",
        403,
      );
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw new AppError("INPUT_INVALID", "Oczekiwano danych JSON.", 400);
    if (!request.body) throw new AppError("INPUT_INVALID", "Brak danych.", 400);
    const text = await readBoundedText(
      request.body,
      8000,
      new AppError("INPUT_INVALID", "Żądanie jest zbyt duże.", 400),
      signal,
    );
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AppError("INPUT_INVALID", "Nieprawidłowe dane JSON.", 400);
    }
    const parsed = (
      channel === "web" ? verifyInputSchema : channelInputSchema
    ).safeParse(json);
    if (!parsed.success)
      throw new AppError(
        "INPUT_INVALID",
        parsed.error.issues[0]?.message ?? "Nieprawidłowa teza.",
        400,
      );
    const input =
      "claim" in parsed.data
        ? parsed.data
        : { claim: parsed.data.content, statedAt: parsed.data.statedAt };
    acceptedInput = input;
    assertSessionActive(session);
    requireConfiguration();
    const { result, reused } = await runVerification(
      input,
      session,
      requestId,
      signal,
      onProgress,
    );
    const delivered = { ...result, delivery: { channel, reused } };
    signal.throwIfAborted();
    auditAttempted = true;
    try {
      writeAudit(session, {
        requestId,
        channel,
        ...input,
        durationMs: Date.now() - start,
        result: delivered,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AUDIT_UNAVAILABLE",
        "Nie udało się zapisać przebiegu sprawdzenia. Spróbuj ponownie.",
        503,
        true,
      );
    }
    console.info(
      JSON.stringify({
        requestId,
        status: result.status,
        channel,
        reused,
        verificationId: result.requestId,
        durationMs: Date.now() - start,
        sourceCount: result.sources.length,
      }),
    );
    return respond(
      channel === "web" ? delivered : channelReply(delivered),
      200,
    );
  } catch (error) {
    if (!(error instanceof AppError) && error instanceof Error)
      console.warn(JSON.stringify({ requestId, errorType: error.name }));
    controller.abort();
    // A provider's timeout can settle before the route's timer callback runs.
    // Classify an expired shared budget by the deadline, not callback ordering.
    let failure =
      timedOut || Date.now() >= deadlineAt
        ? new AppError(
            "VERIFICATION_TIMEOUT",
            "Analiza przekroczyła limit czasu. Spróbuj ponownie.",
            504,
            true,
          )
        : request.signal.aborted || transportSignal?.aborted
          ? new AppError("REQUEST_CANCELLED", "Analiza została przerwana.", 499)
          : error instanceof AppError
            ? error
            : new AppError(
                "PROVIDER_ERROR",
                "Nie udało się połączyć z usługą analizy. Spróbuj ponownie.",
                502,
                true,
              );
    if (acceptedInput) {
      try {
        assertSessionActive(session);
      } catch (error) {
        if (error instanceof AppError && error.code === "SESSION_DELETED") {
          failure = error;
          deleted = true;
        }
      }
      if (!deleted && !auditAttempted) {
        try {
          writeAudit(session, {
            requestId,
            channel,
            ...acceptedInput,
            durationMs: Date.now() - start,
            errorCode: failure.code,
          });
        } catch {
          console.error(
            JSON.stringify({ requestId, event: "audit_write_failed" }),
          );
        }
      }
    }
    console.info(
      JSON.stringify({
        requestId,
        code: failure.code,
        durationMs: Date.now() - start,
      }),
    );
    return respond(
      {
        requestId,
        status: "technical_error",
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
      },
      failure.status,
    );
  } finally {
    clearTimeout(timer);
  }
}
