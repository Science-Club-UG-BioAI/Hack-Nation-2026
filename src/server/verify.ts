import { countSourcesByProvider } from "@/core/source-counts";
import {
  auditSchema,
  planSchema,
  providerLabels,
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
import { generate, searchContext } from "./providers";
import type { z } from "zod";
import { numberSetting } from "./config";
import { maskPersonalData } from "@/core/privacy";
import { verificationDate } from "@/core/verification-date";
import { retrieve } from "./retrieval";
import { enrichPublicationDates } from "./publication-dates";
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
  const maskedContext = maskPersonalData(input.imageContext ?? "");
  const context = guardClaim(maskedContext.text).claim;
  const startedAt = Date.now();
  const checkedAt = new Date(startedAt).toISOString();
  const today = verificationDate(startedAt);
  input = {
    ...input,
    claim: masked.text,
    imageContext: context || undefined,
    statedAt: input.statedAt || today,
  };
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
      return await generate(
        schema,
        context
          ? instruction +
              " Pole imageContext to pomocniczy opis grafiki wygenerowany przez model. Użyj go do ustalenia, czego dotyczy teza i jakich źródeł szukać. Zachowaj zakres tezy użytkownika. Podpis mema nie potwierdza wypowiedzi osoby na zdjęciu. Ustalenia i werdykt uzasadniaj wyłącznie niezależnymi źródłami."
          : instruction,
        payload,
        signal,
        {
          deadlineAt: operationDeadline,
          maxOutputTokens: outputTokenLimit ?? budget.maxOutputTokens,
        },
      );
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
  const securityWarnings: string[] =
    masked.count || maskedContext.count
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
    const counts = countSourcesByProvider(documents);
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
      retrieval: retrieval.map((item) => ({
        ...item,
        documents: counts.get(item.provider) ?? 0,
      })),
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
  let searchHints: Awaited<ReturnType<typeof searchContext>> = [];
  try {
    searchHints = await searchContext(
      analysisInput.claim,
      AbortSignal.any([signal, AbortSignal.timeout(6_000)]),
    );
    searchHints = searchHints.filter(
      (hit) => !hasControlInstruction(`${hit.title}\n${hit.excerpt}`),
    );
  } catch {
    signal.throwIfAborted();
    // Evidence retrieval can proceed using the original claim if context lookup fails.
  }
  let plan = await model(
    planSchema,
    planningInstruction(today, calendarGuidance),
    { ...analysisInput, searchHints },
  );
  if (
    plan.clarificationKind === "missing_evidence" ||
    plan.clarificationKind === "ambiguous_claim" ||
    (plan.needsClarification && plan.clarificationKind !== "no_search_anchor")
  ) {
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
      "Jakiego zdarzenia lub podmiotu dotyczy to twierdzenie?",
    );
  if (!plan.checkable)
    return simple(
      "not_checkable",
      "Wypowiedź została rozpoznana jako opinia lub nierozstrzygalna prognoza. Nie oceniamy jej jako prawdziwej ani fałszywej.",
    );
  if (plan.queries.length !== 2 || plan.queries[0] === plan.queries[1])
    throw invalidOutput();
  // Always search the actual claim as well as the model's contextual query.
  // A paraphrase must not silently drop quantities or substitute another event.
  plan = { ...plan, queries: [analysisInput.claim, plan.queries[1]] };
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
  await enrichPublicationDates(documents, signal);
  const incompleteProviders = retrieval
    .filter(
      (source) => source.status === "error" || source.status === "partial",
    )
    .map((source) => providerLabels[source.provider]);
  if (
    !documents.length &&
    (found.hits.length > 0 || incompleteProviders.length > 0)
  )
    return noDecision(
      "unable_to_verify",
      protectedSources.removed > 0
        ? "Po odfiltrowaniu fragmentów z poleceniami dla modelu nie pozostał żaden materiał do sprawdzenia tezy."
        : found.hits.length > 0
          ? "Wśród znalezionych materiałów nie było tekstu, który można było wykorzystać do sprawdzenia tezy."
          : `Wyszukiwanie było niepełne (${incompleteProviders.join(", ")}). Nie udało się pobrać materiału do sprawdzenia tezy.`,
    );
  if (!documents.length)
    return simple(
      "insufficient",
      "Nie znaleziono dostępnego tekstu źródeł pozwalającego ocenić tę tezę. To nie jest dowód jej fałszywości.",
    );
  const retrievalWarnings = incompleteProviders.map(
    (provider) =>
      `Niepełne wyszukiwanie: ${provider}. Część materiałów była niedostępna.`,
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
          " Popraw przyczynę podaną w validationIssues. Jeśli przekroczono limit cytatów, skróć ustalenia i ponownie użyj wybranych identyfikatorów w findings, evidence i basis.",
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
        `Wyszukiwanie było niepełne (${incompleteProviders.join(", ")}). W dostępnych materiałach nie znaleziono dowodów pozwalających ocenić tezę.`,
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
  const auditFailure = await auditFindings(
    assessment.findings ?? [],
    requestId,
    deadlineAt,
    (outputTokenLimit) =>
      model(auditSchema, instructionForAudit, auditPayload, outputTokenLimit),
  );
  if (auditFailure) {
    return noDecision("unable_to_verify", auditFailure, documents, [
      "Nie potwierdzono zgodności wszystkich ustaleń i przypisanych cytatów z proponowaną oceną.",
      ...retrievalWarnings,
    ]);
  }
  return finish(
    {
      ...assessment,
      limitations: [...assessment.limitations, ...retrievalWarnings],
    },
    documents,
  );
}
