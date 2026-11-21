import { NextResponse } from "next/server";
import { configuration } from "@/server/config";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(
    { status: "ok", providers: configuration() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
