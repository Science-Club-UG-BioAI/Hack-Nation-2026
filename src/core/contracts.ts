import { z } from "zod";

export const verdictSchema = z.enum([
  "supported",
  "refuted",
  "misleading",
  "insufficient",
  "not_checkable",
]);
export const verdictLabels = {
  supported: "Potwierdzone",
  refuted: "Fałszywe",
  misleading: "Wprowadzające w błąd",
  insufficient: "Brak wystarczających dowodów",
  not_checkable: "Nie podlega weryfikacji",
} as const;
export const statusLabels = {
  completed: "Sprawdzenie zakończone",
  needs_clarification: "Potrzebne doprecyzowanie",
  out_of_scope: "Poza zakresem prototypu",
  unable_to_verify: "Nie można ukończyć sprawdzenia",
} as const;
export type VerificationStatus = keyof typeof statusLabels;
export const verifyInputSchema = z
  .object({
    claim: z
      .string()
      .trim()
      .min(20, "Wpisz przynajmniej 20 znaków.")
      .max(500, "Teza może mieć najwyżej 500 znaków."),
    statedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(value);
        return (
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }, "Nieprawidłowa data.")
      .optional(),
  })
  .strict();

export const planSchema = z.object({
  checkable: z.boolean(),
  needsClarification: z.boolean(),
  clarificationKind: z
    .enum(["none", "ambiguous_claim", "missing_evidence"])
    .default("none"),
  outOfScope: z.boolean().default(false),
  explanation: z.string().min(1).max(1200),
  queries: z.array(z.string().min(3).max(350)).min(0).max(2),
  wikipediaQuery: z.string().min(2).max(150).nullable().default(null),
  sejmQuery: z.string().min(3).max(150).nullable().default(null),
  arxivQuery: z.string().min(3).max(150).nullable().default(null),
});
export const evidenceSchema = z.object({
  sourceId: z.string().min(1),
  chunkId: z.string().min(1),
  quote: z.string().trim().min(12).max(1000),
  relation: z.enum(["supports", "contradicts", "context"]),
  relevance: z.string().min(1).max(700),
});
export const assessmentSchema = z.object({
  verdict: verdictSchema,
  evidenceConflict: z.boolean().optional(),
  explanation: z.string().min(1).max(2500),
  limitations: z.array(z.string().min(1).max(600)).max(8),
  evidence: z.array(evidenceSchema).max(10),
});
export const auditSchema = z.object({
  approved: z.boolean(),
  reason: z.string().min(1).max(1200),
});
export type VerifyInput = z.infer<typeof verifyInputSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type SourceProvider = "web" | "wikipedia" | "sejm" | "arxiv" | "corpus";
export const providerLabels: Record<SourceProvider, string> = {
  corpus: "Korpus audytowalny",
  web: "Wyszukiwanie WWW",
  wikipedia: "Wikipedia API",
  sejm: "Sejm / ELI API",
  arxiv: "arXiv API",
};
export type SourceMetadata = {
  provider?: SourceProvider;
  sourceType?: "web" | "official" | "encyclopedia" | "research";
  contentScope?: "text" | "metadata" | "abstract";
  publisherGroup?: string;
  canonicalUrl?: string;
  notes?: string[];
};
export type RetrievalStatus = {
  provider: SourceProvider;
  status: "ok" | "empty" | "partial" | "error" | "not_applicable";
  documents: number;
};
export type Source = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  retrievedAt: string;
} & SourceMetadata;
export type Document = Source & { chunks: { id: string; text: string }[] };
type ResultBase = {
  requestId: string;
  claim: string;
  checkedClaim?: string;
  statedAt: string | null;
  checkedAt: string;
  sources: Source[];
  mode: "live" | "demo";
  delivery?: { channel: "web" | "discord_demo"; reused: boolean };
  retrieval?: RetrievalStatus[];
  coverage?: {
    citedSources: number;
    publisherGroups: number;
    reviewedSources: number;
    minimumGroups: number;
  };
};
export type VerificationResult = ResultBase &
  (
    | (Assessment & { status: "completed" })
    | (Omit<Assessment, "verdict"> & {
        status: Exclude<VerificationStatus, "completed">;
        verdict: null;
      })
  );
export function resultLabel(result: VerificationResult): string {
  return result.verdict === null
    ? statusLabels[result.status]
    : verdictLabels[result.verdict];
}
export const channelInputSchema = z
  .object({
    content: verifyInputSchema.shape.claim,
    statedAt: verifyInputSchema.shape.statedAt,
  })
  .strict();
export type ChannelReply = {
  channel: "discord_demo";
  delivery: "simulated";
  messages: string[];
  result: VerificationResult;
};
export const apiErrorSchema = z.object({
  status: z.literal("technical_error").optional(),
  requestId: z.string(),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
