import {
  providerLabels,
  type RetrievalStatus,
  type VerificationResult,
} from "@/core/contracts";
import { countSourcesByProvider } from "@/core/source-counts";
import { allowedSourceDomains } from "@/core/source-policy";

const statusNotes: Record<RetrievalStatus["status"], string> = {
  ok: "",
  empty: "brak wyników",
  partial: "część materiałów niedostępna",
  error: "API niedostępne",
  not_applicable: "nie wybrano dla tego tematu",
  not_configured: "brak klucza API",
};

export function RetrievalDetails({
  result,
}: {
  result: Pick<VerificationResult, "mode" | "sources" | "retrieval">;
}) {
  if (result.mode !== "live") return null;
  const providerCounts = countSourcesByProvider(result.sources);
  const providerStatuses = new Map(
    result.retrieval?.map((item) => [item.provider, item.status]),
  );
  const unavailableArticles = result.retrieval?.find(
    ({ provider }) => provider === "demagog",
  )?.unavailableArticles;
  const providers = new Set([
    ...providerStatuses.keys(),
    ...providerCounts.keys(),
  ]);
  if (!providers.size) return null;
  return (
    <details
      className="retrieval-details"
      open={!!unavailableArticles?.length || undefined}
    >
      <summary>Gdzie szukaliśmy dowodów</summary>
      <p>Łącznie zakwalifikowano do analizy: {result.sources.length}.</p>
      <p>Domeny wyszukiwania WWW · {allowedSourceDomains.join(", ")}</p>
      <ul>
        {[...providers].map((provider) => {
          const status = provider && providerStatuses.get(provider);
          const note = status ? statusNotes[status] : "";
          return (
            <li key={provider ?? "unknown"}>
              <strong>
                {provider
                  ? providerLabels[provider]
                  : "Bez oznaczenia dostawcy"}
              </strong>
              : {note && `${note} · `}
              do analizy: {providerCounts.get(provider) ?? 0}
              {provider === "demagog" && !!unavailableArticles?.length && (
                <>
                  <p>
                    Google znalazł te publikacje, ale ich treści nie udało się
                    pobrać do analizy.
                  </p>
                  <ul>
                    {unavailableArticles.map(({ url, title }) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
