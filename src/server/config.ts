import { AppError } from "@/core/errors";

export function numberSetting(name: string, fallback: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}
export function configuration() {
  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const tavily = Boolean(process.env.TAVILY_API_KEY?.trim());
  return { ready: gemini && tavily, gemini, tavily };
}
export function requireConfiguration() {
  if (!configuration().ready)
    throw new AppError(
      "NOT_CONFIGURED",
      "Tryb online wymaga kluczy GEMINI_API_KEY i TAVILY_API_KEY w pliku .env.local. Możesz obejrzeć oznaczone przykłady demonstracyjne.",
      503,
    );
}
