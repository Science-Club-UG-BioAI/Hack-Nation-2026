import { z } from "zod";
import { normalize, safeUrl, type SearchHit } from "@/core/evidence";
import { readBoundedText } from "./read-body";
import { startCall } from "./config";

const results = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().optional(),
        claimReview: z
          .array(
            z.object({
              url: z.string().optional(),
              publisher: z.object({ name: z.string().optional() }).optional(),
              title: z.string().optional(),
              textualRating: z.string().optional(),
              reviewDate: z.string().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export async function factCheck(
  query: string,
  signal: AbortSignal,
): Promise<SearchHit[]> {
  const key = process.env.GOOGLE_FACTCHECK_API_KEY?.trim();
  if (!key) throw new Error("Missing Google Fact Check API key");
  const endpoint = new URL(
    "https://factchecktools.googleapis.com/v1alpha1/claims:search",
  );
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("pageSize", "5");
  // The API response does not report billing. Keep the total unknown.
  startCall("google_factcheck");
  const response = await fetch(endpoint, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Goog-Api-Key": key },
  });
  if (!response.ok || !response.body)
    throw new Error("Fact Check Tools unavailable");
  const body = await readBoundedText(
    response.body,
    1_000_000,
    new Error("Fact Check response too large"),
    signal,
  );
  const hits: SearchHit[] = [];
  for (const claim of results.parse(JSON.parse(body)).claims) {
    if (!claim.text?.trim()) continue;
    for (const review of claim.claimReview) {
      const url = safeUrl(review.url ?? "");
      if (!url || !review.textualRating?.trim()) continue;
      // The reviewed claim and the publisher's judgment must travel together.
      // Review URLs are citations only. Never fetch arbitrary publisher pages.
      const record = `Sprawdzana teza: ${normalize(claim.text)} · Ocena wydawcy: ${normalize(review.textualRating)}`;
      // Keep the full claim and rating within the citation contract.
      if (record.length > 1000) continue;
      hits.push({
        provider: "google_factcheck",
        url,
        title: review.title?.trim() || claim.text,
        publisher: review.publisher?.name,
        published_date: review.reviewDate,
        contentScope: "metadata",
        raw_content: record,
        notes: [
          "Rekord ClaimReview z Google Fact Check. Zawiera treść sprawdzanej tezy i ocenę jej wydawcy.",
        ],
      });
    }
  }
  return hits;
}
