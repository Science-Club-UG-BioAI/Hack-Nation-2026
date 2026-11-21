import { NextRequest, NextResponse } from "next/server";
import { demoResult } from "@/core/demo";

export function GET(request: NextRequest) {
  const result = demoResult(request.nextUrl.searchParams.get("id") ?? "");
  return NextResponse.json(result ?? { message: "Nie znaleziono przykładu." }, {
    status: result ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
