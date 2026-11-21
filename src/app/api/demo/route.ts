import { NextRequest, NextResponse } from "next/server";
import { demoResult } from "@/core/demo";

import { syntheticGraphDemo, syntheticId } from "@/server/demo-graph";

export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const result = id === syntheticId ? syntheticGraphDemo() : demoResult(id);
  return NextResponse.json(result ?? { message: "Nie znaleziono przykładu." }, {
    status: result ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
