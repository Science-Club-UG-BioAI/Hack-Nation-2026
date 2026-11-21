import { useState } from "react";
import { EvidenceGraphView } from "./evidence-graph-view";
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

// Optional presentation fields from KITCHECK track 2. Older responses remain usable.
type SourceDetails = Source & {
  publisher?: string;
  publisherIsDomain?: boolean;
  updatedAt?: string | null;
  eventPeriod?: string;
  archived?: boolean;
  archiveWarning?: string;
};
type ResultDetails = VerificationResult & {
  strength?: string | { description: string };
  archiveWarning?: string;
  sources: SourceDetails[];
};

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function sourceDate(value: string | null | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return <time dateTime={value}>{value.slice(0, 10)}</time>;
}

export function VerificationView({ result }: { result: ResultDetails }) {
  const [copied, setCopied] = useState(false);
  const strength =
    typeof result.strength === "string"
      ? result.strength
      : result.strength?.description;
  const displayedVerdict = result.verdict;
  const displayedLabel = resultLabel(result);
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
          ...result.sources.map((s) => `${s.title}: ${s.url}`),
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
      {result.status === "completed" && strength && (
        <aside className="coverage-panel" aria-label="Siła podstawy">
          <strong>Siła podstawy</strong>
          <p>{strength}</p>
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
      {result.evidenceConflict && (
        <p className="status-notice">
          Sprzeczne dowody: źródła wskazują różne ustalenia. Nie rozstrzygamy
          arbitralnie, które są poprawne.
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
            Przeanalizowane materiały: {result.coverage.reviewedSources}.
            Potwierdzenie lub obalenie wymaga dowodów z co najmniej{" "}
            {result.coverage.minimumGroups} grup. Różne domeny nie gwarantują
            niezależności informacji.
          </small>
        </div>
      )}
      {result.retrieval && result.retrieval.length > 0 && (
        <details className="retrieval-details">
          <summary>Gdzie szukaliśmy dowodów</summary>
          <ul>
            {result.retrieval.map((item) => (
              <li key={item.provider}>
                <strong>{providerLabels[item.provider]}</strong>:{" "}
                {
                  {
                    ok: "pobrano materiały",
                    empty: "brak wyników",
                    partial: "część materiałów niedostępna",
                    error: "API niedostępne",
                    not_applicable: "nie wybrano dla tego tematu",
                  }[item.status]
                }
                {item.documents > 0 &&
                  ` (${item.documents}, przed usunięciem duplikatów)`}
              </li>
            ))}
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
                          Okres zdarzenia · {source.eventPeriod}
                        </>
                      )}
                      <br />
                      Pobrano · {dateLabel(source.retrievedAt)}
                    </small>
                    {(source.archived || source.archiveWarning) && (
                      <small className="source-archive-warning">
                        {source.archiveWarning ||
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
