import {
  auditSchema,
  planSchema,
  type Assessment,
  type Document,
  type VerificationResult,
  type VerifyInput,
  type RetrievalStatus,
  type VerificationStatus,
} from "@/core/contracts";
import {
  prepareDocuments,
  evidenceCoverage,
  hasCorroboration,
  requireCorroboration,
  publisherGroup,
} from "@/core/evidence";
import { AppError, invalidOutput, InvalidModelOutput } from "@/core/errors";
import { generate } from "./providers";
import type { z } from "zod";
import { numberSetting } from "./config";
import { maskPersonalData } from "@/core/privacy";
import { verificationDate } from "@/core/verification-date";
import { retrieve } from "./retrieval";
import type { ProgressListener, ProgressStage } from "@/core/progress";
import {
  guardClaim,
  guardDocuments,
  hasControlInstruction,
} from "@/core/untrusted";
import {
  quotationCatalog,
  resolveSelection,
  reasonedSelectionSchema,
} from "@/core/quotations";

import {
  planningInstruction,
  assessmentInstruction,
  auditInstruction,
  calendarGuidanceFor,
} from "./verification-instructions";

export {
  PLAN_PROMPT,
  ASSESS_PROMPT,
  AUDIT_PROMPT,
} from "./verification-instructions";

const PLAN_BUDGET = { durationMs: 12_000, maxOutputTokens: 1600 };
const ASSESSMENT_BUDGET = { durationMs: 24_000, maxOutputTokens: 4500 };
const AUDIT_BUDGET = { durationMs: 15_000, maxOutputTokens: 1600 };

async function auditFindings(
  findings: NonNullable<Assessment["findings"]>,
  requestId: string,
  deadlineAt: number,
  runAudit: (maxOutputTokens?: number) => Promise<z.infer<typeof auditSchema>>,
): Promise<boolean> {
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
  const findingsApproved =
    checks.length === findings.length &&
    new Set(checks.map((c) => c.findingId)).size === checks.length &&
    findings.every((f) =>
      checks.some((c) => c.findingId === f.id && c.supported && c.atomic),
    );
  if (audit.approved && findingsApproved) return true;
  console.warn(
    JSON.stringify({
      requestId,
      event: "semantic_audit_rejected",
      approved: audit.approved,
      findingsApproved,
      findings: findings.length,
      checks: checks.length,
      unsupported: checks.filter((c) => !c.supported).length,
      nonatomic: checks.filter((c) => !c.atomic).length,
    }),
  );
  return false;
}

export async function verify(
  input: VerifyInput,
  requestId: string,
  signal: AbortSignal,
  onProgress?: ProgressListener,
  presentCompleted?: (
    result: Extract<VerificationResult, { status: "completed" }>,
    documents: Document[],
  ) => Pick<VerificationResult, "evidenceGraph" | "graphStatus">,
): Promise<VerificationResult> {
  const masked = maskPersonalData(input.claim);
  const startedAt = Date.now();
  const checkedAt = new Date(startedAt).toISOString();
  const today = verificationDate(startedAt);
  input = { ...input, claim: masked.text, statedAt: input.statedAt || today };
  const deadlineAt =
    startedAt + numberSetting("VERIFY_TIMEOUT_MS", 60_000, 60_000);
  let currentStage: ProgressStage = "planning";
  const model = async <T>(
    schema: z.ZodType<T>,
    instruction: string,
    payload: unknown,
    outputTokenLimit?: number,
  ): Promise<T> => {
    const start = Date.now();
    const reserveMs =
      currentStage === "auditing" || deadlineAt - startedAt < 1000 ? 0 : 10_000;
    const budget =
      currentStage === "auditing"
        ? AUDIT_BUDGET
        : currentStage === "planning"
          ? PLAN_BUDGET
          : ASSESSMENT_BUDGET;
    const operationDeadline = Math.min(
      deadlineAt - reserveMs,
      start + budget.durationMs,
    );
    try {
      return await generate(schema, instruction, payload, signal, {
        deadlineAt: operationDeadline,
        maxOutputTokens: outputTokenLimit ?? budget.maxOutputTokens,
      });
    } finally {
      console.info(
        JSON.stringify({
          requestId,
          stage: currentStage,
          durationMs: Date.now() - start,
          elapsedMs: Date.now() - startedAt,
        }),
      );
    }
  };
  const guarded = guardClaim(input.claim);
  const calendarGuidance = calendarGuidanceFor(guarded.claim);
  const analysisInput = {
    ...input,
    claim: guarded.removed ? guarded.claim : input.claim,
    verificationDate: today,
  };
  const securityWarnings: string[] = masked.count
    ? [
        "Przed analizą zamaskowano rozpoznane dane osobowe. Wynik dotyczy treści po maskowaniu; jeśli usunięte dane są niezbędne do sprawdzenia, potrzebne będzie doprecyzowanie bez danych poufnych.",
      ]
    : [];
  const recordGuard = (location: string, count: number) => {
    if (!count) return;
    console.warn(
      JSON.stringify({
        requestId,
        event: "untrusted_instruction_filtered",
        location,
        count,
      }),
    );
    securityWarnings.push(
      location === "input"
        ? "Pominięto polecenia sterujące odpowiedzią; sprawdzono wyłącznie pozostałą treść twierdzenia."
        : "Pominięto fragmenty źródeł zawierające rozpoznane polecenia sterujące modelem.",
    );
  };
  recordGuard("input", guarded.removed);
  let retrieval: RetrievalStatus[] = [];
  const stage = (name: ProgressStage) => {
    currentStage = name;
    onProgress?.({ type: "stage", stage: name });
    console.info(
      JSON.stringify({
        requestId,
        stage: name,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  };
  const completedResult = (
    assessment: Assessment,
    documents: Document[],
  ): Extract<VerificationResult, { status: "completed" }> => {
    signal.throwIfAborted();
    return {
      ...assessment,
      explanation: calendarGuidance
        ? `Data odniesienia dla tezy: ${input.statedAt}.\n\n${assessment.explanation}`
        : assessment.explanation,
      citationContract: "findings-v1",
      findings: assessment.findings ?? [],
      limitations: [...assessment.limitations, ...securityWarnings],
      ...(guarded.removed ? { checkedClaim: analysisInput.claim } : {}),
      status: "completed",
      evidenceConflict: assessment.evidenceConflict ?? false,
      requestId,
      claim: input.claim,
      statedAt: input.statedAt ?? null,
      checkedAt,
      mode: "live",
      retrieval,
      coverage: evidenceCoverage(assessment, documents),
      sources: documents.map(({ chunks: _chunks, ...source }) => source),
    };
  };
  const finish = (assessment: Assessment, documents: Document[]) => {
    const result = completedResult(assessment, documents);
    return { ...result, ...presentCompleted?.(result, documents) };
  };
  const simple = (
    verdict: "insufficient" | "not_checkable",
    explanation: string,
  ): VerificationResult =>
    finish({ verdict, explanation, limitations: [], evidence: [] }, []);
  const noDecision = (
    status: Exclude<VerificationStatus, "completed">,
    explanation: string,
    documents: Document[] = [],
    limitations: string[] = [],
  ): VerificationResult => ({
    ...completedResult(
      { verdict: "insufficient", explanation, limitations, evidence: [] },
      documents,
    ),
    status,
    verdict: null,
  });
  signal.throwIfAborted();
  if (/^https?:\/\/\S+$/i.test(input.claim.trim()))
    return noDecision(
      "out_of_scope",
      "Ten prototyp przyjmuje tekst. Wklej treść twierdzenia zamiast samego adresu strony; nie pobraliśmy treści z tego linku.",
    );
  if (guarded.removed && analysisInput.claim.length < 12)
    return noDecision(
      "needs_clarification",
      "Po oddzieleniu poleceń nie pozostało jednoznaczne twierdzenie. Podaj fakt, który mamy sprawdzić.",
    );
  stage("planning");
  let plan = await model(
    planSchema,
    planningInstruction(today, calendarGuidance),
    analysisInput,
  );
  if (plan.clarificationKind === "missing_evidence") {
    plan = { ...plan, needsClarification: false, checkable: true };
    if (plan.queries.length !== 2 || plan.queries[0] === plan.queries[1])
      plan.queries = [
        analysisInput.claim.slice(0, 300),
        `Dokumenty źródłowe i weryfikacja: ${analysisInput.claim.slice(0, 280)}`,
      ];
  }
  if (plan.queries.some(hasControlInstruction))
    throw invalidOutput([
      "Search queries must not contain model-control commands.",
    ]);
  if (plan.outOfScope)
    return noDecision(
      "out_of_scope",
      "To zgłoszenie wykracza poza tekstową weryfikację publicznie dostępnych informacji. Podaj pojedynczą tezę do sprawdzenia.",
    );
  if (plan.needsClarification)
    return noDecision(
      "needs_clarification",
      "Doprecyzuj podmiot, okres i zakres twierdzenia. Nie możemy jednoznacznie ustalić, co mamy sprawdzić.",
    );
  if (!plan.checkable)
    return simple(
      "not_checkable",
      "Wypowiedź została rozpoznana jako opinia lub nierozstrzygalna prognoza. Nie oceniamy jej jako prawdziwej ani fałszywej.",
    );
  if (plan.queries.length !== 2 || plan.queries[0] === plan.queries[1])
    throw invalidOutput();
  stage("searching");
  const found = await retrieve(plan, signal, onProgress);
  retrieval = found.statuses;
  const prepared = prepareDocuments(
    found.hits,
    analysisInput.claim,
    new Date().toISOString(),
  );
  const protectedSources = guardDocuments(prepared);
  recordGuard("source", protectedSources.removed);
  const documents = protectedSources.documents;
  if (
    !documents.length &&
    (found.hits.length > 0 ||
      retrieval.some((s) => s.status === "error" || s.status === "partial"))
  )
    return noDecision(
      "unable_to_verify",
      "Nie udało się uzyskać tekstu materiałów potrzebnych do sprawdzenia. To ograniczenie dostępu, a nie ocena prawdziwości twierdzenia.",
    );
  if (!documents.length)
    return simple(
      "insufficient",
      "Nie znaleziono dostępnego tekstu źródeł pozwalającego ocenić tę tezę. To nie jest dowód jej fałszywości.",
    );
  const retrievalWarnings = retrieval
    .filter((s) => ["error", "partial"].includes(s.status))
    .map(
      (s) =>
        `Niepełne wyszukiwanie: ${s.provider}. Część materiałów była niedostępna.`,
    );
  const catalog = quotationCatalog(documents);
  const payload = {
    ...analysisInput,
    documents: catalog.modelDocuments,
    retrievalWarnings,
  };
  const instruction = assessmentInstruction(calendarGuidance);
  let assessment: Assessment;
  let draft: unknown;
  let repaired = false;
  stage("assessing");
  try {
    draft = await model(reasonedSelectionSchema, instruction, payload);
    assessment = resolveSelection(draft, catalog, documents, true);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "INVALID_MODEL_OUTPUT")
      throw error;
    console.warn(
      JSON.stringify({
        requestId,
        event: "assessment_validation_failed",
        validationIssues:
          error instanceof InvalidModelOutput ? error.validationIssues : [],
      }),
    );
    if (deadlineAt - Date.now() < 18_000) throw error;
    // At most one repair, sharing the original deadline. No fabricated replacement citations.
    stage("repairing_citations");
    repaired = true;
    assessment = resolveSelection(
      await model(
        reasonedSelectionSchema,
        instruction +
          " Poprzednia próba nie przeszła walidacji. Sprawdź dokładne cytaty i identyfikatory.",
        {
          ...payload,
          previousAssessment: draft,
          validationIssues:
            error instanceof InvalidModelOutput
              ? error.validationIssues
              : ["Invalid model response."],
        },
      ),
      catalog,
      documents,
      true,
    );
  }
  // An empty evidence selection after successful retrieval can safely end in
  // abstention. Publish only a server-authored limitation, never unaudited model
  // explanations or claims about the non-existence of the alleged event.
  if (assessment.verdict === "insufficient" && !assessment.evidence.length) {
    if (retrievalWarnings.length)
      return noDecision(
        "unable_to_verify",
        "Wyszukiwanie było niepełne i nie uzyskano dowodów pozwalających ukończyć sprawdzenie.",
        documents,
        [...assessment.limitations, ...retrievalWarnings],
      );
    return finish(
      {
        verdict: "insufficient",
        explanation:
          "W pobranych materiałach nie wskazano dowodów pozwalających potwierdzić lub obalić tę tezę. Brak potwierdzenia nie oznacza fałszu.",
        limitations: [
          ...assessment.limitations,
          "Nie ustalono, czy opisane zdarzenie miało miejsce. Sprawdzenie obejmuje tylko pobrane materiały; dalsza ocena wymaga dowodu dotyczącego wskazanego zdarzenia, podmiotu i okresu.",
        ],
        evidence: [],
      },
      documents,
    );
  }
  if (
    !repaired &&
    deadlineAt - Date.now() >= 18_000 &&
    !hasCorroboration(assessment, documents) &&
    new Set(documents.map((d) => d.publisherGroup || publisherGroup(d.url)))
      .size >= 2
  ) {
    stage("corroborating");
    assessment = resolveSelection(
      await model(
        reasonedSelectionSchema,
        instruction +
          " Poprzednia ocena użyła zbyt mało grup źródeł. Sprawdź pozostałe materiały; jeśli nie potwierdzają wniosku, zwróć insufficient z dostępnymi cytatami. Nie wymyślaj dodatkowych dowodów.",
        payload,
      ),
      catalog,
      documents,
      true,
    );
  }
  assessment = requireCorroboration(assessment, documents);
  stage("auditing");
  console.info(
    JSON.stringify({ requestId, proposedVerdict: assessment.verdict }),
  );
  const instructionForAudit = auditInstruction(calendarGuidance);
  const auditPayload = {
    ...analysisInput,
    documents,
    retrievalWarnings,
    assessment,
  };
  const approved = await auditFindings(
    assessment.findings ?? [],
    requestId,
    deadlineAt,
    (outputTokenLimit) =>
      model(auditSchema, instructionForAudit, auditPayload, outputTokenLimit),
  );
  if (!approved) {
    return noDecision(
      "unable_to_verify",
      "Kontrola zgodności dowodów z wnioskiem nie pozwoliła ukończyć sprawdzenia. Nie publikujemy niezatwierdzonej oceny.",
      documents,
      [
        "Nie potwierdzono zgodności wszystkich ustaleń i przypisanych cytatów z proponowaną oceną.",
        ...retrievalWarnings,
      ],
    );
  }
  return finish(
    {
      ...assessment,
      limitations: [...assessment.limitations, ...retrievalWarnings],
    },
    documents,
  );
}
