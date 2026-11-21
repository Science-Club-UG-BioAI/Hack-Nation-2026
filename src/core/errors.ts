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
