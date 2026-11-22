import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyInputSchema, channelInputSchema } from "@/core/contracts";
import { AppError } from "@/core/errors";
import { verificationDate } from "@/core/verification-date";
import { readBoundedText } from "@/server/read-body";
import type { ProgressListener } from "@/core/progress";
import {
  assertSameOrigin,
  sessionId,
  setSessionCookie,
} from "./request-session";
import { executeVerification } from "./execute-verification";

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
    channel === "web" ? 16_000 : 8000,
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
  const session = sessionId(request) ?? randomUUID();
  const outcome = await executeVerification(
    async (start, signal) => {
      assertSameOrigin(request);
      return readVerificationInput(request, channel, start, signal);
    },
    session,
    channel,
    request.signal,
    onProgress,
    transportSignal,
  );
  const response = NextResponse.json(outcome.body, {
    status: outcome.status,
    headers: {
      "Cache-Control": "no-store",
      ...(outcome.status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
  if (!outcome.deleted) setSessionCookie(request, response, session);
  return response;
}
