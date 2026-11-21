import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import { deleteSessionAudit, sessionAudit } from "@/server/audit-store";
import { clearSessionVerifications } from "@/server/verification-service";
import { assertSessionActive } from "@/server/audit-store";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";

function session(request: NextRequest) {
  const origin = request.headers.get("origin");
  let sameOrigin = true;
  if (origin) {
    try {
      sameOrigin =
        new URL(origin).origin ===
        `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
    } catch {
      sameOrigin = false;
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" || !sameOrigin)
    throw new AppError(
      "INPUT_INVALID",
      "Żądanie pochodzi z innej witryny.",
      403,
    );
  const value = request.cookies.get("prawdowid-session")?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}
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
    const id = session(request);
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
    let id = session(request);
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
    response.cookies.set("prawdowid-session", id ?? randomUUID(), {
      httpOnly: true,
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 86400,
      path: "/",
    });
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
    const id = session(request);
    if (id) {
      deleteSessionAudit(id);
      clearSessionVerifications(id);
    }
    const response = NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set("prawdowid-session", "", {
      httpOnly: true,
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
