import type { NextRequest } from "next/server";
import { handleVerification } from "@/server/handle-verification";
export const runtime = "nodejs";
export const maxDuration = 65;
export function POST(request: NextRequest) {
  return handleVerification(request, "discord_demo");
}
