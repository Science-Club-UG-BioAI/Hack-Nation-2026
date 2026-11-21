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

export function ImageInput({
  disabled,
  onUseClaim,
}: {
  disabled: boolean;
  onUseClaim: (claim: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<ImageDescription | null>(null);
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
    setResult(null);
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
    }
  }

  async function describe(image: File) {
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
        if (response.ok) setResult(imageDescriptionSchema.parse(data));
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

  const suggestedClaim = result?.suggestedClaim;
  return (
    <details className="image-input">
      <summary>Dodaj obraz</summary>
      <label htmlFor="claim-image">
        Wybierz obraz (JPG, PNG lub WebP, do 4 MiB)
      </label>
      <input
        ref={inputRef}
        id="claim-image"
        type="file"
        accept={imageMimeSchema.options.join(",")}
        disabled={disabled}
        onChange={(event) => select(event.target.files?.[0])}
        aria-describedby="image-privacy"
      />
      {file && preview && (
        <img
          className="image-preview"
          alt="Podgląd wybranego obrazu"
          src={preview}
        />
      )}
      <p className="input-privacy-hint" id="image-privacy">
        Po kliknięciu „Opisz obraz” plik trafi do Google Gemini. Dane widoczne
        na obrazie są przesyłane bez maskowania.
      </p>
      {!result && (
        <button
          type="button"
          className="example-button"
          disabled={disabled || busy || !file}
          onClick={() => file && void describe(file)}
        >
          Opisz obraz
        </button>
      )}
      {busy && (
        <button type="button" className="text-button" onClick={cancel}>
          Anuluj opis
        </button>
      )}
      {file && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            select(undefined);
            inputRef.current?.focus();
          }}
        >
          Usuń obraz
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <div role="status">
        {busy && "Odczytywanie obrazu…"}
        {result && (
          <>
            <strong>Opis obrazu</strong>
            <p>{result.description}</p>
            {suggestedClaim ? (
              <>
                <strong>Proponowana teza</strong>
                <p>{suggestedClaim}</p>
              </>
            ) : (
              <p>
                Model nie odczytał sprawdzalnej tezy. Możesz wpisać własną
                poniżej.
              </p>
            )}
          </>
        )}
      </div>
      {suggestedClaim && (
        <button
          type="button"
          className="example-button"
          disabled={disabled}
          onClick={() => onUseClaim(suggestedClaim)}
        >
          Wstaw tezę do formularza
        </button>
      )}
    </details>
  );
}
