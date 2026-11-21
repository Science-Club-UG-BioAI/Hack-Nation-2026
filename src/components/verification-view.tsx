import { countSourcesByProvider } from "@/core/source-counts";
import { allowedSourceDomains } from "@/core/source-policy";
import { useState } from "react";
import { EvidenceGraphView } from "./evidence-graph-view";
import { sourceDisagreement } from "@/core/source-disagreement";
import {
  resultLabel,
  providerLabels,
  type Source,
  type VerificationResult,
} from "@/core/contracts";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

// Older snapshots may use the earlier warning names.
type SourceDetails = Source & {
  archived?: boolean;
  archiveWarning?: string;
};
type ResultDetails = VerificationResult & {
  archiveWarning?: string;
};

function strengthSummary(
  value: VerificationResult["strength"] | string | { description: string },
) {
  if (!value || typeof value === "string") return value;
  return "summary" in value ? value.summary : value.description;
}

function periodLabel(period: Source["eventPeriod"] | string) {
  if (!period || typeof period === "string") return period;
  const { from, to } = period;
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ? `od ${from}` : to ? `do ${to}` : null;
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function publicationDateLabel(value: string | null | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

function sourceDate(value: string | null | undefined) {
  const label = publicationDateLabel(value);
  if (!label || !value) return null;
  const datetime = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date(value).toISOString();
  return <time dateTime={datetime}>{label}</time>;
}

export function VerificationView({ result }: { result: ResultDetails }) {
  const [copied, setCopied] = useState(false);
  const strength = strengthSummary(result.strength);
  const displayedVerdict = result.verdict;
  const displayedLabel = resultLabel(result);
  const disagreement = sourceDisagreement(result);
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
  const sourcesById = new Map<string, SourceDetails>(
    result.sources.map((source) => [source.id, source]),
  );
  const citedIds = new Set(result.evidence.map((item) => item.sourceId));
  const uncitedSources = result.sources.filter(
    (source) => !citedIds.has(source.id),
  );
  async function copyResult() {
    try {
      await navigator.clipboard.writeText(
        [
          result.mode === "demo"
            ? "PRZYKŁAD DEMONSTRACYJNY"
            : "Automatyczna analiza znalezionych materiałów",
          result.claim,
          displayedLabel,
          result.explanation,
          ...result.limitations,
          ...result.sources.map((s) =>
            [
              `${s.title}: ${s.url}`,
              `Publikacja · ${publicationDateLabel(s.publishedAt) ?? "data nieustalona"}`,
              ...(s.updatedAt
                ? [
                    `Aktualizacja · ${publicationDateLabel(s.updatedAt) ?? "data nieustalona"}`,
                  ]
                : []),
              `Pobrano · ${dateLabel(s.retrievedAt)}`,
            ].join("\n"),
          ),
          dateLabel(result.checkedAt),
        ].join("\n\n"),
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <div className={`verdict verdict-${displayedVerdict}`}>
        <span aria-hidden="true">
          {displayedVerdict === "supported"
            ? "✓"
            : displayedVerdict === "refuted"
              ? "×"
              : "?"}
        </span>
        <h2 id="result-title">{displayedLabel}</h2>
      </div>
      {result.status === "unable_to_verify" && (
        <p className="status-notice">
          <strong>Dlaczego?</strong> {result.explanation}
        </p>
      )}
      {result.mode === "demo" && (
        <p className="demo-notice">
          Przykład demonstracyjny przygotowany ręcznie. To nie jest wynik
          bieżącej analizy AI.
        </p>
      )}
      <p className="checked-claim">{result.claim}</p>
      {result.checkedClaim && result.checkedClaim !== result.claim && (
        <p className="status-notice">
          Sprawdzane twierdzenie po oddzieleniu poleceń: {result.checkedClaim}
        </p>
      )}
      {result.contextQuery && (
        <div className="coverage-panel">
          <strong>Zapytanie doprecyzowane na podstawie WWW</strong>
          <p>{result.contextQuery}</p>
        </div>
      )}
      {result.status !== "unable_to_verify" && (
        <p className="explanation">
          {result.citationContract === "findings-v1"
            ? result.explanation.split(/(\[\d+\])/).map((part, i) => {
                const number = /^\[(\d+)\]$/.exec(part)?.[1];
                return number &&
                  Number(number) > 0 &&
                  Number(number) <= result.evidence.length ? (
                  <a
                    key={i}
                    href={`#evidence-${number}`}
                    aria-label={`Dowód ${number}`}
                  >
                    {part}
                  </a>
                ) : (
                  part
                );
              })
            : result.explanation}
        </p>
      )}
      {disagreement.length > 0 ? (
        <section
          className="coverage-panel"
          aria-label="Rozbieżności między źródłami"
        >
          <h3>Rozbieżności między źródłami</h3>
          {result.evidenceConflict && (
            <p>Dostępne dowody pozostawiają rozbieżność nierozstrzygniętą.</p>
          )}
          {disagreement.map((side) => (
            <div key={side.relation}>
              <h4>{side.label}</h4>
              <ul>
                {side.positions.map((position, index) => (
                  <li key={index}>
                    {position.text}
                    <ul>
                      {position.citations.map(({ source, number }) => (
                        <li key={number}>
                          <a href={`#evidence-${number}`}>
                            {source.title} · dowód {number}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : result.evidenceConflict ? (
        <p className="status-notice">
          Rozbieżność między źródłami pozostaje nierozstrzygnięta.
        </p>
      ) : null}
      {result.status === "completed" && strength && (
        <aside className="coverage-panel" aria-label="Siła podstawy">
          <strong>Siła podstawy</strong>
          <p>{strength}</p>
          {result.strength?.limitations?.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </aside>
      )}
      {result.archiveWarning && (
        <p className="status-notice">{result.archiveWarning}</p>
      )}
      {result.status === "completed" && result.evidenceGraph && (
        <EvidenceGraphView graph={result.evidenceGraph} />
      )}
      {result.graphStatus === "failed" && (
        <p role="status" className="status-notice">
          Nie udało się zbudować grafu dowodowego. Wyświetlono wynik sprawdzenia
          całego twierdzenia.
        </p>
      )}
      {result.graphStatus === "unavailable" &&
        result.status !== "unable_to_verify" && (
          <p className="status-notice">
            Graf pojawi się po sprawdzeniu doprecyzowanego twierdzenia w
            obsługiwanym zakresie.
          </p>
        )}

      {result.status !== "completed" && (
        <p className="status-notice">
          To status obsługi zgłoszenia. Nie wydano werdyktu o prawdziwości.
        </p>
      )}
      {result.delivery?.reused && (
        <p className="reuse-notice">
          To ten sam wynik sprawdzenia z tej sesji, z datą podaną poniżej. Nie
          wykonano ponownego wyszukiwania. Wynik jest współdzielony między
          kanałami przez maksymalnie 5 minut.
        </p>
      )}
      {result.status === "completed" && result.coverage && (
        <div className="coverage-panel">
          <strong>
            Cytowane źródła: {result.coverage.citedSources} · Grupy wydawców:{" "}
            {result.coverage.publisherGroups}
          </strong>
          <small>
            Materiały zakwalifikowane do analizy: {result.sources.length}.
            Potwierdzenie lub obalenie wymaga dowodów z co najmniej{" "}
            {result.coverage.minimumGroups} grup. Różne domeny nie gwarantują
            niezależności informacji.
          </small>
        </div>
      )}
      {providers.size > 0 && result.mode === "live" && (
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
              const note =
                status &&
                {
                  ok: "",
                  empty: "brak wyników",
                  partial: "część materiałów niedostępna",
                  error: "API niedostępne",
                  not_applicable: "nie wybrano dla tego tematu",
                  not_configured: "brak klucza API",
                }[status];
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
                        Google znalazł te publikacje, ale ich treści nie udało
                        się pobrać do analizy.
                      </p>
                      <ul>
                        {unavailableArticles.map(({ url, title }) => (
                          <li key={url}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
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
      )}
      {result.evidence.length > 0 && (
        <div className="evidence-list">
          <h3>Dowody, które możesz sprawdzić</h3>
          {result.evidence.map((e, index) => {
            const source = sourcesById.get(e.sourceId);
            const publisher = source?.publisher?.trim();
            const domain = source ? sourceDomain(source.url) : "";
            const publisherIsDomain =
              source?.publisherIsDomain ??
              Boolean(
                publisher && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(publisher),
              );
            return (
              <article
                id={`evidence-${index + 1}`}
                tabIndex={-1}
                className="evidence"
                key={`${e.chunkId}-${index}`}
              >
                <div className="evidence-top">
                  <span className={`relation relation-${e.relation}`}>
                    {e.relation === "supports"
                      ? "POTWIERDZA"
                      : e.relation === "contradicts"
                        ? "ZAPRZECZA"
                        : "KONTEKST"}
                  </span>
                  <span>Dowód {index + 1}</span>
                </div>
                <blockquote>{e.quote}</blockquote>
                <p>{e.relevance}</p>
                {source && (
                  <>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                    </a>
                    <small>
                      {source.provider &&
                        `${providerLabels[source.provider]} · `}
                      {source.contentScope === "metadata"
                        ? "Tylko metadane"
                        : source.contentScope === "abstract"
                          ? "Tylko abstrakt"
                          : "Pobrany tekst"}
                      <br />
                      {publisher && !publisherIsDomain ? (
                        <>Wydawca · {publisher}</>
                      ) : (
                        <>
                          Domena źródła (zamiast nazwy wydawcy) ·{" "}
                          {publisher || domain || "brak danych"}
                        </>
                      )}
                      <br />
                      Publikacja ·{" "}
                      {sourceDate(source.publishedAt) ?? "brak daty"}
                      {source.updatedAt && (
                        <>
                          <br />
                          Aktualizacja ·{" "}
                          {sourceDate(source.updatedAt) ?? "brak daty"}
                        </>
                      )}
                      {source.eventPeriod && (
                        <>
                          <br />
                          Okres zdarzenia · {periodLabel(source.eventPeriod)}
                        </>
                      )}
                      <br />
                      Pobrano · {dateLabel(source.retrievedAt)}
                    </small>
                    {(source.freshnessWarning ||
                      source.archived ||
                      source.archiveWarning) && (
                      <small className="source-archive-warning">
                        {source.freshnessWarning ||
                          source.archiveWarning ||
                          "Materiał archiwalny. Sprawdź, czy dotyczy okresu tezy."}
                      </small>
                    )}
                    {source.notes?.map((note, i) => (
                      <small key={i}>{note}</small>
                    ))}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {result.limitations.length > 0 && (
        <aside className="limitations">
          <h3>Co warto mieć na uwadze</h3>
          <ul>
            {result.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </aside>
      )}
      {uncitedSources.length > 0 && (
        <details className="source-links">
          <summary>
            Pozostałe przejrzane materiały — bez zatwierdzonego cytatu
          </summary>
          {uncitedSources.map((source) => (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              key={source.id}
            >
              {source.title}
              {source.provider && ` · ${providerLabels[source.provider]}`}
              {source.contentScope === "metadata"
                ? " · tylko metadane"
                : source.contentScope === "abstract"
                  ? " · tylko abstrakt"
                  : ""}
            </a>
          ))}
        </details>
      )}
      <footer className="result-footer">
        <span>
          {result.mode === "demo" ? "Przygotowano" : "Sprawdzono"}:{" "}
          {dateLabel(result.checkedAt)}
          <br />
          {result.mode === "live" &&
            "Automatyczna analiza znalezionych materiałów"}
        </span>
        <button className="text-button" onClick={() => void copyResult()}>
          <span aria-live="polite">
            {copied ? "Skopiowano" : "Kopiuj wynik"}
          </span>
        </button>
      </footer>
    </>
  );
}
