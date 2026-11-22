import { useState } from "react";
import { EvidenceGraphView } from "./evidence-graph-view";
import { RetrievalDetails } from "./retrieval-details";
import { SourceQuote } from "./source-quote";
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

export function VerificationView({
  result,
  onRetry,
}: {
  result: ResultDetails;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [graphOpened, setGraphOpened] = useState(false);
  const canShowGraph = result.status === "completed" && result.evidenceGraph;
  const blockedArticles = result.retrieval?.some(
    ({ unavailableArticles }) => unavailableArticles?.length,
  );
  const strength = strengthSummary(result.strength);
  const displayedVerdict = result.verdict;
  const displayedLabel = resultLabel(result);
  const disagreement = sourceDisagreement(result);
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
          ...(result.contextualizedClaim
            ? [
                `Proponowana teza po doprecyzowaniu: ${result.contextualizedClaim}`,
              ]
            : []),
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
      {result.status === "unable_to_verify" && onRetry && (
        <button type="button" className="text-button" onClick={onRetry}>
          Spróbuj ponownie
        </button>
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
      {result.status === "unable_to_verify" && blockedArticles && (
        <RetrievalDetails result={result} />
      )}
      {result.evidence.length > 0 && (
        <div className="evidence-list">
          <h3>Dowody, które możesz sprawdzić</h3>
          {result.coverage && (
            <p className="muted">
              Cytowane źródła: {result.coverage.citedSources} · Przejrzane
              materiały: {result.sources.length}
            </p>
          )}

          {result.evidence.map((e, index) => {
            const source = sourcesById.get(e.sourceId);
            const published = sourceDate(source?.publishedAt);
            const format =
              source?.contentScope === "metadata"
                ? "Tylko metadane"
                : source?.contentScope === "abstract"
                  ? "Tylko abstrakt"
                  : "";
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
                <SourceQuote text={e.quote} sourceUrl={source?.url} />
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
                    {(format || published) && (
                      <small>
                        {format}
                        {published && (
                          <>
                            {format && " · "}Publikacja {published}
                          </>
                        )}
                      </small>
                    )}
                    <details className="source-metadata">
                      <summary>Metadane źródła</summary>
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
                        {!published && (
                          <>
                            <br />
                            Publikacja · brak daty
                          </>
                        )}
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
                      {source.notes?.map((note, i) => (
                        <small key={i}>{note}</small>
                      ))}
                    </details>
                    {(source.freshnessWarning ||
                      source.archived ||
                      source.archiveWarning) && (
                      <small className="source-archive-warning">
                        {source.freshnessWarning ||
                          source.archiveWarning ||
                          "Materiał archiwalny. Sprawdź, czy dotyczy okresu tezy."}
                      </small>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {canShowGraph && (
        <details
          className="result-disclosure"
          onToggle={(event) => {
            if (event.currentTarget.open) setGraphOpened(true);
          }}
        >
          <summary>Pokaż graf dowodowy</summary>
          {graphOpened && <EvidenceGraphView graph={canShowGraph} />}
        </details>
      )}
      {(result.contextualizedClaim || result.contextQuery) && (
        <details className="result-disclosure">
          <summary>Kontekst wyszukiwania</summary>
          {result.contextualizedClaim && (
            <div className="coverage-panel">
              <strong>Proponowana teza po doprecyzowaniu</strong>
              <p>{result.contextualizedClaim}</p>
              <small>Ocena powyżej dotyczy tezy wejściowej.</small>
            </div>
          )}
          {result.contextQuery && (
            <div className="coverage-panel">
              <strong>Zapytanie doprecyzowane na podstawie WWW</strong>
              <p>{result.contextQuery}</p>
            </div>
          )}
        </details>
      )}
      {(result.retrieval?.length ||
        result.sources.length ||
        strength ||
        result.delivery?.reused ||
        result.archiveWarning ||
        result.graphStatus) && (
        <details className="result-disclosure">
          <summary>Szczegóły analizy</summary>
          {result.graphStatus === "failed" && (
            <p role="status">Graf dowodowy jest niedostępny.</p>
          )}
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
          {result.delivery?.reused && (
            <p className="reuse-notice">
              Pokazujemy wynik wcześniejszego sprawdzenia z tej sesji. Oba
              kanały mogą z niego korzystać przez godzinę od zakończenia
              analizy.
            </p>
          )}
          {result.status === "completed" && result.coverage && (
            <div className="coverage-panel">
              <strong>Grupy wydawców: {result.coverage.publisherGroups}</strong>
              <small>
                Potwierdzenie lub obalenie wymaga dowodów z co najmniej{" "}
                {result.coverage.minimumGroups} grup. Różne domeny nie
                gwarantują niezależności informacji.
              </small>
            </div>
          )}
          {!(result.status === "unable_to_verify" && blockedArticles) && (
            <RetrievalDetails result={result} />
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
