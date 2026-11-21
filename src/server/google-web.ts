import { z } from "zod";
import { maskPersonalData } from "@/core/privacy";
import { startCall } from "./config";
import { readBoundedText } from "./read-body";

const searchResponse = z.object({
  organic: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        snippet: z.string().optional(),
      }),
    )
    .default([]),
});

export async function googleWebSearch(
  query: string,
  provider: "demagog",
  limit: number,
  signal: AbortSignal,
) {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) throw new Error("Missing Serper API key");
  startCall(provider);
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    signal,
    redirect: "error",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({
      q: maskPersonalData(query).text,
      gl: "pl",
      hl: "pl",
      num: limit,
    }),
  });
  if (!response.ok || !response.body)
    throw new Error("Google search via Serper unavailable");
  const body = await readBoundedText(
    response.body,
    250_000,
    new Error("Search response too large"),
    signal,
  );
  return searchResponse.parse(JSON.parse(body)).organic;
}
