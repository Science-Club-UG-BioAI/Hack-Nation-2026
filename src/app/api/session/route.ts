import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import {
  assertSessionActive,
  deleteSessionAudit,
  sessionAudit,
} from "@/server/audit-store";
import { clearSessionVerifications } from "@/server/verification-service";
import {
  assertSameOrigin,
  sessionId,
  setSessionCookie,
} from "@/server/request-session";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";

function failure(error: unknown) {
  return NextResponse.json(
    {
      message:
        error instanceof AppError
          ? error.message
          : "Nie udało się odczytać lub usunąć zapisu sesji. Spróbuj ponownie.",
    },
    {
      status: error instanceof AppError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const id = sessionId(request);
    return NextResponse.json(
      { retentionHours: 24, records: id ? sessionAudit(id) : [] },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="prawdowid-sesja.json"',
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
export function POST(request: NextRequest) {
  try {
    if (request.headers.get("x-prawdowid-action") !== "start-session")
      throw new AppError(
        "INPUT_INVALID",
        "Brak nagłówka rozpoczęcia sesji.",
        403,
      );
    assertSameOrigin(request);
    let id = sessionId(request);
    if (id) {
      try {
        assertSessionActive(id);
      } catch (error) {
        if (error instanceof AppError && error.code === "SESSION_DELETED")
          id = null;
        else throw error;
      }
    }
    const response = NextResponse.json(
      { ready: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    setSessionCookie(request, response, id ?? randomUUID());
    return response;
  } catch (error) {
    return failure(error);
  }
}
export function DELETE(request: NextRequest) {
  try {
    if (request.headers.get("x-prawdowid-action") !== "delete-session")
      throw new AppError(
        "INPUT_INVALID",
        "Brak nagłówka operacji usunięcia.",
        403,
      );
    assertSameOrigin(request);
    const id = sessionId(request);
    if (id) {
      deleteSessionAudit(id);
      clearSessionVerifications(id);
    }
    const response = NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    setSessionCookie(request, response, null);
    return response;
  } catch (error) {
    return failure(error);
  }
}
