import { useEffect, useRef, useState } from "react";
import { apiErrorSchema } from "@/core/contracts";
import {
  imageDescriptionSchema,
  imageMimeSchema,
  MAX_IMAGE_BYTES,
  type ImageDescription,
} from "@/core/vision";
import { ensureSession } from "./session-controls";
import { useVerificationRequest } from "./use-verification-request";

export type ImageAttachment = ImageDescription | "unread" | null;

export function ImageInput({
  disabled,
  attachment,
  hasClaim,
  onChange,
}: {
  disabled: boolean;
  attachment: ImageAttachment;
  hasClaim: boolean;
  onChange: (value: ImageAttachment) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const result = attachment === "unread" ? null : attachment;
  const [error, setError] = useState("");
  const { busy, cancel, runRequest } = useVerificationRequest();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function select(next: File | undefined) {
    cancel();
    onChange(null);
    setPreview("");
    setError("");
    setFile(null);
    if (!next) return;
    if (!imageMimeSchema.safeParse(next.type).success) {
      setError("Wybierz obraz JPG, PNG lub WebP.");
    } else if (!next.size || next.size > MAX_IMAGE_BYTES) {
      setError("Wybierz niepusty obraz o rozmiarze do 4 MiB.");
    } else {
      setFile(next);
      void describe(next);
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function describe(image: File) {
    onChange("unread");
    setError("");
    await runRequest(
      async (signal) => {
        await ensureSession(signal);
        const response = await fetch("/api/vision", {
          method: "POST",
          body: image,
          signal,
        });
        const data: unknown = await response.json();
        signal.throwIfAborted();
        if (response.ok) onChange(imageDescriptionSchema.parse(data));
        else setError(apiErrorSchema.parse(data).message);
      },
      (timedOut) =>
        setError(
          timedOut
            ? "Opis obrazu przekroczył limit czasu. Spróbuj ponownie."
            : "Nie udało się pobrać opisu obrazu. Spróbuj ponownie.",
        ),
    );
  }

  return (
    <div className="image-input">
      <label htmlFor="claim-image">
        Dołącz obraz <span className="optional">opcjonalnie</span>
      </label>
      <p className="input-privacy-hint" id="image-privacy">
        Wybór pliku wysyła obraz do Google Gemini bez maskowania. Jego opis
        zostanie dołączony do tezy.
      </p>
      <input
        ref={inputRef}
        id="claim-image"
        type="file"
        accept={imageMimeSchema.options.join(",")}
        disabled={disabled}
        onChange={(event) => select(event.target.files?.[0])}
        aria-describedby="image-privacy image-formats"
      />
      <small id="image-formats">JPG, PNG lub WebP · do 4 MiB</small>
      {file && preview && (
        <img
          className="image-preview"
          alt="Podgląd wybranego obrazu"
          src={preview}
        />
      )}
      <div role="status" aria-label="Odczyt obrazu" hidden={!file}>
        {busy
          ? "Odczytywanie obrazu…"
          : result && "Kontekst obrazu dołączony do tezy."}
        {result &&
          !hasClaim &&
          !result.suggestedClaim &&
          " Wpisz tezę, którą chcesz sprawdzić."}
      </div>
      {result && (
        <details>
          <summary>Pokaż opis obrazu</summary>
          <p>{result.description}</p>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {file && error && (
        <button
          type="button"
          className="example-button"
          disabled={disabled || busy}
          onClick={() => void describe(file)}
        >
          Ponów odczyt
        </button>
      )}
      {file && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            select(undefined);
            inputRef.current?.focus();
          }}
        >
          Usuń obraz
        </button>
      )}
    </div>
  );
}
