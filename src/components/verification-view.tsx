import { useState } from "react";
import {
  resultLabel,
  providerLabels,
  type VerificationResult,
} from "@/core/contracts";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

export function VerificationView({ result }: { result: VerificationResult }) {
  const [copied, setCopied] = useState(false);
  const sourcesById = new Map(
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
          resultLabel(result),
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
      <div className={`verdict verdict-${result.verdict}`}>
        <span>
          {result.verdict === "supported"
            ? "✓"
            : result.verdict === "refuted"
              ? "×"
              : "?"}
        </span>
        <h2 id="result-title">{resultLabel(result)}</h2>
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
      <p className="explanation">{result.explanation}</p>
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
            return (
              <article className="evidence" key={`${e.chunkId}-${index}`}>
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
                      {new URL(source.url).hostname} ·{" "}
                      {source.publishedAt
                        ? `Publikacja: ${source.publishedAt}`
                        : "Data publikacji nieustalona"}
                      <br />
                      Pobrano: {dateLabel(source.retrievedAt)}
                    </small>
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
          {copied ? "Skopiowano" : "Kopiuj wynik"}
        </button>
      </footer>
    </>
  );
}
