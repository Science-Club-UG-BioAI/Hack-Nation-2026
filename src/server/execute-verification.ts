import { randomUUID } from "node:crypto";
import type { VerifyInput } from "@/core/contracts";
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
import { assertSessionActive, writeAudit } from "./audit-store";
import type { ProgressListener } from "@/core/progress";

// Shared orchestration for HTTP and the Discord Gateway process.
export async function executeVerification(
  readInput: (startedAt: number, signal: AbortSignal) => Promise<VerifyInput>,
  session: string,
  channel: "web" | "discord_demo" | "discord",
  requestSignal: AbortSignal,
  onProgress?: ProgressListener,
  transportSignal?: AbortSignal,
) {
  const requestId = randomUUID();
  const start = Date.now();
  const controller = new AbortController();
  const signal = AbortSignal.any([
    requestSignal,
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
  const respond = <T>(body: T, status: number) => ({ body, status, deleted });
  try {
    const input = await readInput(start, signal);
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
      channel === "discord_demo" ? channelReply(delivered) : delivered,
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
      requestSignal.aborted || transportSignal?.aborted === true,
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
