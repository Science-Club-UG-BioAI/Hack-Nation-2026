import type { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/core/errors";

const COOKIE_NAME = "prawdowid-session";

export function sessionId(request: NextRequest) {
  const id = request.cookies.get(COOKIE_NAME)?.value;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function setSessionCookie(
  request: NextRequest,
  response: NextResponse,
  id: string | null,
) {
  response.cookies.set(COOKIE_NAME, id ?? "", {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    maxAge: id === null ? 0 : 86400,
    path: "/",
  });
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") !== "cross-site") {
    if (!origin) return;
    try {
      const parsed = new URL(origin);
      // Next can normalize 127.0.0.1 to localhost in nextUrl.
      const host = request.headers.get("host") || request.nextUrl.host;
      if (parsed.protocol === request.nextUrl.protocol && parsed.host === host)
        return;
    } catch {
      // Invalid origins receive the same response as foreign origins.
    }
  }
  throw new AppError("INPUT_INVALID", "Żądanie pochodzi z innej witryny.", 403);
}
