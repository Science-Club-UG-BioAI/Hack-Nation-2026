import type {
  ApiErrorBody,
  RetrievalStatus,
  VerificationResult,
} from "./contracts";

export const stageLabels = {
  planning: "Rozpoznawanie tezy",
  searching: "Zbieranie źródeł",
  assessing: "Ocena dowodów",
  repairing_citations: "Ponowna kontrola cytatów",
  corroborating: "Uzupełnianie dowodów",
  auditing: "Kontrola wniosku",
  graph_validating: "Budowanie grafu z ustaleń",
  reused: "Odczyt wyniku z tej sesji",
  waiting: "Oczekiwanie na trwające sprawdzenie",
} as const;
export type ProgressStage = keyof typeof stageLabels;
export type ProgressEvent =
  | { type: "stage"; stage: ProgressStage }
  | {
      type: "source";
      source: Omit<RetrievalStatus, "status"> & {
        status: RetrievalStatus["status"] | "running";
      };
    };
export type VerificationEvent =
  | ProgressEvent
  | { type: "result"; result: VerificationResult }
  | { type: "error"; error: ApiErrorBody };
export type ProgressListener = (event: ProgressEvent) => void;

// The transport may split a frame or a UTF-8 character across network chunks.
export async function readVerificationStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: VerificationEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  try {
    while (!terminal) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!frame.startsWith("data: ")) continue;
        const event: VerificationEvent = JSON.parse(frame.slice(6));
        onEvent(event);
        if (event.type === "result" || event.type === "error") {
          terminal = true;
          break;
        }
      }
      if (done) break;
    }
    if (!terminal)
      throw new Error("Verification stream ended without a result");
  } finally {
    // A terminal event is sufficient even if the sender stalls during cleanup.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
