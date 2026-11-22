import type { z } from "zod";
import type { Assessment, auditSchema } from "@/core/contracts";
import { InvalidModelOutput } from "@/core/errors";

export async function auditFindings(
  findings: NonNullable<Assessment["findings"]>,
  requestId: string,
  deadlineAt: number,
  runAudit: (maxOutputTokens?: number) => Promise<z.infer<typeof auditSchema>>,
): Promise<string | null> {
  let audit: z.infer<typeof auditSchema>;
  try {
    audit = await runAudit();
  } catch (error) {
    // Retry only an explicitly unfinished provider response, never an adverse
    // semantic judgment. Both attempts share the original deadline; no partial
    // JSON or first-attempt findings are accepted as an audit.
    if (
      !(error instanceof InvalidModelOutput) ||
      !error.validationIssues.includes("interaction_incomplete") ||
      deadlineAt - Date.now() < 10_000
    )
      throw error;
    console.warn(
      JSON.stringify({ requestId, event: "audit_incomplete_retry" }),
    );
    audit = await runAudit(3200);
  }

  const checks = audit.findingChecks ?? [];
  const checkedIds = new Set(checks.map((check) => check.findingId));
  const complete =
    checks.length === findings.length &&
    checkedIds.size === checks.length &&
    findings.every((finding) => checkedIds.has(finding.id));
  const unsupported = checks.filter((check) => !check.supported).length;
  const nonatomic = checks.filter((check) => !check.atomic).length;
  if (audit.approved && complete && !unsupported && !nonatomic) return null;
  console.warn(
    JSON.stringify({
      requestId,
      event: "semantic_audit_rejected",
      approved: audit.approved,
      findingsApproved: complete && !unsupported && !nonatomic,
      findings: findings.length,
      checks: checks.length,
      unsupported,
      nonatomic,
    }),
  );
  if (!complete)
    return "Końcowa kontrola nie objęła poprawnie wszystkich ustaleń potrzebnych do wydania oceny.";
  if (unsupported)
    return "Przytoczone fragmenty źródeł nie uzasadniały co najmniej jednego z ustaleń.";
  if (nonatomic)
    return "Jedno z ustaleń łączyło kilka twierdzeń, które wymagają osobnego sprawdzenia.";
  return "Końcowa kontrola nie potwierdziła, że proponowana ocena wynika z przytoczonych źródeł.";
}
