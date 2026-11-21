import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  verifyInputSchema,
  channelInputSchema,
  type VerifyInput,
} from "@/core/contracts";
import {
  AppError,
  InvalidModelOutput,
  verificationFailure,
} from "@/core/errors";
import {
  numberSetting,
  requireConfiguration,
  usageContext,
  summarizeUsage,
  type UsageCall,
} from "@/server/config";
import { runVerification } from "./verification-service";
import { channelReply } from "@/core/channel";
import { notifyRecipient } from "./alerts";
import { verificationDate } from "@/core/verification-date";
import { readBoundedText } from "@/server/read-body";
import { assertSessionActive, writeAudit } from "./audit-store";
import type { ProgressListener } from "@/core/progress";
import {
  assertSameOrigin,
  sessionId,
  setSessionCookie,
} from "./request-session";

async function readVerificationInput(
  request: NextRequest,
  channel: "web" | "discord_demo",
  startedAt: number,
  signal: AbortSignal,
) {
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
  const supplied =
    "claim" in parsed.data
      ? parsed.data
      : { claim: parsed.data.content, statedAt: parsed.data.statedAt };
  return {
    ...supplied,
    statedAt: supplied.statedAt ?? verificationDate(startedAt),
  };
}

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
  const calls: UsageCall[] = [];
  let deleted = false;
  const timeoutMs = numberSetting("VERIFY_TIMEOUT_MS", 60_000, 60_000);
  const deadlineAt = start + timeoutMs;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const session = sessionId(request) ?? randomUUID();
  const respond = (body: unknown, status: number) => {
    const response = NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    });
    if (!deleted) setSessionCookie(request, response, session);
    return response;
  };
  try {
    assertSameOrigin(request);
    const input = await readVerificationInput(request, channel, start, signal);
    acceptedInput = input;
    assertSessionActive(session);
    requireConfiguration();
    const { result, reused } = await usageContext.run(calls, () =>
      runVerification(input, session, requestId, signal, onProgress, channel),
    );
    const delivered = {
      ...result,
      usage: summarizeUsage(calls, reused),
      delivery: { channel, reused },
    };
    signal.throwIfAborted();
    auditAttempted = true;
    try {
      writeAudit(session, {
        requestId,
        channel,
        ...input,
        durationMs: Date.now() - start,
        result: delivered,
        calls,
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
    await notifyRecipient(session, requestId, delivered, signal);
    assertSessionActive(session);
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
    let failure = verificationFailure(
      error,
      timedOut || Date.now() >= deadlineAt,
      request.signal.aborted || transportSignal?.aborted === true,
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
            calls,
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
        validationIssues:
          failure instanceof InvalidModelOutput
            ? failure.validationIssues
            : undefined,
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
