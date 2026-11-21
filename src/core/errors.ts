export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export class InvalidModelOutput extends AppError {
  constructor(public validationIssues: string[] = []) {
    super(
      "INVALID_MODEL_OUTPUT",
      "Nie udało się bezpiecznie zweryfikować odpowiedzi modelu. Spróbuj ponownie.",
      502,
      true,
    );
  }
}
export function invalidOutput(issues: string[] = []) {
  return new InvalidModelOutput(issues);
}

export function verificationFailure(
  error: unknown,
  timedOut: boolean,
  cancelled: boolean,
) {
  if (timedOut)
    return new AppError(
      "VERIFICATION_TIMEOUT",
      "Analiza przekroczyła limit czasu. Spróbuj ponownie.",
      504,
      true,
    );
  if (cancelled)
    return new AppError("REQUEST_CANCELLED", "Analiza została przerwana.", 499);
  if (error instanceof AppError) return error;
  return new AppError(
    "PROVIDER_ERROR",
    "Nie udało się połączyć z usługą analizy. Spróbuj ponownie.",
    502,
    true,
  );
}
