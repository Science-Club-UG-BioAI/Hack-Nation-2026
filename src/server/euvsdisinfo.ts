import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SearchHit } from "@/core/evidence";
import { startCall } from "./config";
import { readBoundedText } from "./read-body";
import { htmlText, type SourceBatch } from "./source-adapters";

const ENDPOINT = "https://mcp.euvsd.info/mcp";
const MAX_HITS = 3;

const resultSchema = z.object({
  jsonrpc: z.literal("2.0"),
  result: z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z
        .object({
          results: z.array(
            z.object({
              type: z.enum(["article", "claim_review"]),
              title: z.string(),
              content: z.string(),
              link: z.string(),
            }),
          ),
        })
        .optional(),
    })
    .optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});

export function euvsdisinfoConfigured() {
  return Boolean(process.env.EUVSDISINFO_API_KEY?.trim());
}

function parseMessage(body: string, contentType: string) {
  if (contentType.includes("application/json")) return JSON.parse(body);
  const data = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .at(-1);
  if (!data) throw new Error("Empty EUvsDisinfo response");
  return JSON.parse(data);
}

function reportUrl(link: string): string {
  const url = new URL(link);
  if (url.protocol !== "https:" || url.hostname !== "euvsdisinfo.eu")
    throw new Error("Unexpected EUvsDisinfo link");
  return url.toString();
}

export async function euvsdisinfo(
  query: string,
  signal: AbortSignal,
  dates?: { from?: string; to?: string },
): Promise<SourceBatch> {
  const key = process.env.EUVSDISINFO_API_KEY?.trim();
  if (!key) throw new Error("EUVSDISINFO_API_KEY is not configured");
  if (query.trim().length < 3) return { hits: [], partial: false };
  startCall("euvsdisinfo");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    redirect: "error",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-API-Key": key,
      "mcp-session-id": randomUUID(),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "search",
        arguments: {
          query: query.trim(),
          ...(dates?.from ? { date_from: dates.from } : {}),
          ...(dates?.to ? { date_to: dates.to } : {}),
        },
      },
    }),
  });
  if (!response.ok || !response.body)
    throw new Error(`EUvsDisinfo unavailable (HTTP ${response.status})`);
  const body = await readBoundedText(
    response.body,
    3_000_000,
    new Error("EUvsDisinfo response too large"),
    signal,
  );
  const message = resultSchema.parse(
    parseMessage(body, response.headers.get("content-type") ?? ""),
  );
  if (message.error || message.result?.isError)
    throw new Error(
      `EUvsDisinfo error: ${message.error?.message ?? "tool error"}`,
    );
  const results = message.result?.structuredContent?.results ?? [];
  const hits = results.slice(0, MAX_HITS).map((item) => {
    const url = reportUrl(item.link);
    const review = item.type === "claim_review";
    return {
      title: item.title,
      url,
      canonicalUrl: url,
      provider: "euvsdisinfo",
      raw_content: htmlText(item.content),
      sourceType: "official",
      contentScope: "text",
      publisher: "EUvsDisinfo (Europejska Służba Działań Zewnętrznych)",
      publisherGroup: "euvsdisinfo.eu",
      notes: review
        ? [
            "Przypadek z bazy EUvsDisinfo (EEAS East StratCom). Sekcja SUMMARY to cytowana dezinformacja, NIE fakt; ustalenia zawiera sekcja RESPONSE.",
          ]
        : [
            "Artykuł analityczny EUvsDisinfo (EEAS East StratCom) o prokremlowskiej dezinformacji.",
          ],
    } satisfies SearchHit;
  });
  return { hits, partial: false };
}
