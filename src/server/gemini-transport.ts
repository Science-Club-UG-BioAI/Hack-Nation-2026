import { setTimeout as delay } from "node:timers/promises";
import { AppError, invalidOutput } from "@/core/errors";

export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";

type Failure = {
  error: AppError;
  retry: boolean;
  fallback: boolean;
  waitMs?: number;
};

async function failure(response: Response): Promise<Failure> {
  let error: {
    code?: string;
    status?: string;
    message?: string;
    details?: unknown;
  } = {};
  try {
    error = (await response.json()).error ?? {};
  } catch {
    /* No raw provider errors in logs or UI. */
  }
  const code = String(
    typeof error.code === "string" ? error.code : (error.status ?? ""),
  ).toLowerCase();
  const detail =
    `${error.message ?? ""} ${JSON.stringify(error.details ?? [])}`.toLowerCase();
  const unavailable = () => ({
    error: new AppError(
      "MODEL_UNAVAILABLE",
      "Modele Gemini są chwilowo niedostępne. Spróbuj ponownie za chwilę.",
      503,
      true,
    ),
    retry: true,
    fallback: true,
  });
  if (
    response.status === 402 ||
    code === "payment_required" ||
    (code === "failed_precondition" && /billing|credit|payment/.test(detail))
  )
    return {
      error: new AppError(
        "PROVIDER_PAYMENT_REQUIRED",
        "Google zgłasza problem z rozliczeniami lub brak środków. Sprawdź Billing w Google AI Studio dla projektu przypisanego do klucza.",
        503,
      ),
      retry: false,
      fallback: false,
    };
  if ([401, 403].includes(response.status))
    return {
      error: new AppError(
        "PROVIDER_AUTH_ERROR",
        "Google odrzuciło dostęp. Sprawdź klucz API, uprawnienia projektu i wymagania konta w Google AI Studio.",
        503,
      ),
      retry: false,
      fallback: false,
    };
  if (response.status === 429) {
    const daily =
      code === "quota_exceeded" ||
      /perday|per_day|daily|limit:\s*0\b|limit["\s:]+0\b/.test(detail);
    if (daily)
      return {
        error: new AppError(
          "PROVIDER_QUOTA_EXCEEDED",
          "Wyczerpano limit Gemini dla projektu. Sprawdź limity w Google AI Studio; ponowienie analizy teraz nie pomoże.",
          429,
        ),
        retry: false,
        fallback: false,
      };
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const waitMs = retryAfter
      ? Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : Math.max(0, Date.parse(retryAfter) - Date.now())
      : 2000;
    return {
      error: new AppError(
        "PROVIDER_RATE_LIMITED",
        "Google ogranicza częstotliwość zapytań. Odczekaj chwilę przed kolejną analizą.",
        429,
        true,
      ),
      retry: Number.isFinite(waitMs) && waitMs <= 5000,
      fallback: false,
      waitMs,
    };
  }
  if ([500, 502, 503, 504].includes(response.status)) return unavailable();
  if (response.status === 404) return { ...unavailable(), retry: false };
  return {
    error: new AppError(
      "PROVIDER_REQUEST_ERROR",
      "Google odrzuciło konfigurację żądania. Sprawdź obsługę modelu i parametry integracji.",
      502,
    ),
    retry: false,
    fallback: false,
  };
}

// At most three HTTP requests per model operation: primary, one retry, fallback.
// No fallback on account/billing/quota errors. All attempts share the route deadline.
export async function geminiResponse(
  payload: Record<string, unknown>,
  signal: AbortSignal,
  options?: { deadlineAt: number },
): Promise<unknown> {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = (
    process.env.GEMINI_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL
  ).trim();
  const models =
    fallback && fallback !== primary ? [primary, fallback] : [primary];
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const attempts = index === 0 ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      signal.throwIfAborted();
      const remainingMs = (options?.deadlineAt ?? Infinity) - Date.now();
      if (remainingMs <= 0)
        throw new AppError(
          "MODEL_UNAVAILABLE",
          "Usługa modelu nie ukończyła etapu w dostępnym czasie. Nie wydano oceny.",
          503,
          true,
        );
      // Reserve a chance for the fallback instead of spending the entire stage
      // on two stalled requests to the same model.
      const attemptMs = Math.max(
        1,
        Math.floor(
          Math.min(
            15_000,
            index + 1 < models.length && options
              ? remainingMs / 2
              : remainingMs,
          ),
        ),
      );
      const attemptSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(attemptMs),
      ]);
      const startedAt = Date.now();
      let failed: Failure;
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            signal: attemptSignal,
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": process.env.GEMINI_API_KEY!,
              "Api-Revision": "2026-05-20",
            },
            body: JSON.stringify({ ...payload, model }),
          },
        );
        if (response.ok) {
          const body: unknown = await response.json();
          console.info(
            JSON.stringify({
              provider: "gemini",
              model,
              fallback: index > 0,
              status: "completed_http",
              durationMs: Date.now() - startedAt,
            }),
          );
          return body;
        }
        failed = await failure(response);
        console.warn(
          JSON.stringify({
            provider: "gemini",
            model,
            httpStatus: response.status,
            code: failed.error.code,
          }),
        );
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof SyntaxError) throw invalidOutput();
        failed = {
          error: new AppError(
            "MODEL_UNAVAILABLE",
            "Nie udało się połączyć z Gemini w wymaganym czasie. Spróbuj ponownie.",
            503,
            true,
          ),
          retry: !attemptSignal.aborted,
          fallback: true,
        };
        console.warn(
          JSON.stringify({
            provider: "gemini",
            model,
            code: "CONNECTION_OR_TIMEOUT",
          }),
        );
      }
      if (failed.retry && attempt + 1 < attempts) {
        const waitMs = failed.waitMs ?? 1000 + Math.floor(Math.random() * 500);
        if (options && Date.now() + waitMs + 1000 >= options.deadlineAt)
          throw failed.error;
        await delay(waitMs, undefined, { signal });
        continue;
      }
      if (failed.fallback && index + 1 < models.length) {
        console.info(
          JSON.stringify({
            provider: "gemini",
            fallbackFrom: model,
            fallbackTo: models[index + 1],
          }),
        );
        break;
      }
      throw failed.error;
    }
  }
  throw new AppError(
    "MODEL_UNAVAILABLE",
    "Nie znaleziono dostępnego modelu Gemini.",
    503,
    true,
  );
}
