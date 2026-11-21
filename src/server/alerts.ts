import type { VerificationResult } from "@/core/contracts";
import { repeatedWithoutSources, saveAlert } from "./audit-store";

// Narrow, auditable Polish phrases indicating an immediate public safety risk.
const highRisk =
  /(?<!\p{L})(?:ewakuacj\p{L}*|alarm (?:bombowy|chemiczny|radiacyjny)|skażeni\p{L}* (?:wody|powietrza)|zagrożeni\p{L}* życia|bezpośredni\p{L}* zagrożeni\p{L}* zdrowia)(?!\p{L})/iu;

export async function notifyRecipient(
  session: string,
  id: string,
  result: VerificationResult,
  signal: AbortSignal,
) {
  try {
    const delivery = result.delivery;
    if (!delivery) return;
    const reason =
      !delivery.reused && highRisk.test(result.checkedClaim ?? result.claim)
        ? "high_risk"
        : result.verdict === "insufficient" &&
            result.sources.length === 0 &&
            repeatedWithoutSources(session, result, delivery.channel, id)
          ? "repeated_without_sources"
          : null;
    if (!reason) return;
    const endpoint = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!endpoint) {
      saveAlert(session, id, reason, "unconfigured");
      return;
    }
    let status = "failed",
      httpStatus: number | null = null;
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Invalid webhook");
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
        body: JSON.stringify({ requestId: id, reason }),
      });
      httpStatus = response.status;
      if (response.ok) status = "delivered";
      await response.body?.cancel();
    } catch {
      /* Store only the delivery outcome, never the webhook URL. */
    }
    saveAlert(session, id, reason, status, httpStatus);
  } catch {
    console.warn(
      JSON.stringify({ requestId: id, event: "alert_audit_failed" }),
    );
  }
}
