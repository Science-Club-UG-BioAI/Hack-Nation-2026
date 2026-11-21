import { countSourcesByProvider } from "@/core/source-counts";
import { providerLabels, type VerificationResult } from "@/core/contracts";
import {
  stageLabels,
  type ProgressEvent,
  type ProgressStage,
} from "@/core/progress";
import { Icon } from "./icon";

const steps = [
  {
    id: "planning",
    label: "Rozpoznanie tezy",
    description: "Temat i zakres",
    icon: "search",
  },
  {
    id: "searching",
    label: "Zbieranie źródeł",
    description: "Fakty i kontrdowody",
    icon: "layers",
  },
  {
    id: "assessing",
    label: "Ocena dowodów",
    description: "Cytaty i kontekst",
    icon: "file",
  },
  {
    id: "auditing",
    label: "Kontrola wniosku",
    description: "Zgodność ze źródłami",
    icon: "shield",
  },
] as const;

export type TimedProgress = ProgressEvent & { seconds: number };
export function AnalysisProgress({
  events,
  busy,
  elapsed,
  result,
  interrupted,
  demo,
}: {
  events: TimedProgress[];
  busy: boolean;
  elapsed: number;
  result: VerificationResult | null;
  interrupted: boolean;
  demo: boolean;
}) {
  const stages = events.filter(
    (event): event is TimedProgress & { type: "stage"; stage: ProgressStage } =>
      event.type === "stage",
  );
  const current = stages.at(-1)?.stage;
  const currentStep =
    current === "repairing_citations" || current === "corroborating"
      ? "assessing"
      : current;
  const sources = new Map(
    events.flatMap((event) =>
      event.type === "source"
        ? [[event.source.provider, event.source] as const]
        : [],
    ),
  );
  const providerCounts = result
    ? countSourcesByProvider(result.sources)
    : undefined;
  for (const source of result?.retrieval ?? [])
    sources.set(source.provider, source);
  const title = busy
    ? demo
      ? "Otwieranie przykładu"
      : current
        ? stageLabels[current]
        : "Łączenie z analizą"
    : interrupted
      ? "Analiza zatrzymana"
      : result
        ? result.mode === "demo"
          ? "Przykład demonstracyjny"
          : "Przebieg zakończony"
        : "Każdy etap, na bieżąco";
  return (
    <section className="pipeline-card" aria-labelledby="pipeline-title">
      <div className="pipeline-heading">
        <div>
          <span className="eyebrow">PRZEBIEG WERYFIKACJI</span>
          <h2 id="pipeline-title" aria-live="polite" aria-atomic="true">
            {title}
          </h2>
        </div>
        <span className={`live-badge ${busy && !demo ? "is-live" : ""}`}>
          <Icon name={busy ? "activity" : "clock"} />
          {busy
            ? `${elapsed} s`
            : result
              ? result.mode === "demo"
                ? "DEMO"
                : "Zakończono"
              : interrupted
                ? "Przerwano"
                : "Oczekuje"}
        </span>
      </div>
      <ol className="pipeline-steps">
        {steps.map((step) => {
          const visited = stages.some((event) => event.stage === step.id);
          const running = busy && currentStep === step.id;
          const stopped = interrupted && currentStep === step.id;
          const done = visited && !running && !stopped;
          return (
            <li
              key={step.id}
              className={
                running
                  ? "step-active"
                  : stopped
                    ? "step-stopped"
                    : done
                      ? "step-done"
                      : ""
              }
              aria-current={running ? "step" : undefined}
            >
              <span className="step-icon">
                {running ? (
                  <span className="spinner" />
                ) : (
                  <Icon name={done ? "check" : step.icon} />
                )}
              </span>
              <strong>{step.label}</strong>
              <small>
                {running
                  ? "W trakcie"
                  : stopped
                    ? "Przerwano"
                    : done
                      ? "Zakończono"
                      : result
                        ? "Nie wykonywano"
                        : step.description}
              </small>
            </li>
          );
        })}
      </ol>
      <div className="pipeline-caption">
        {busy && !demo
          ? "Statusy pochodzą z trwającej analizy na serwerze."
          : result?.mode === "demo"
            ? "Gotowy przykład — bez wyszukiwania i analizy na żywo."
            : result?.delivery?.reused
              ? "Ponownie pokazano wynik z tej sesji. Bez nowego wyszukiwania."
              : interrupted
                ? "Nie wydano nowego werdyktu. Możesz uruchomić sprawdzenie ponownie."
                : result
                  ? "Szczegóły oceny i ograniczenia znajdziesz poniżej."
                  : "Po uruchomieniu zobaczysz aktualne działania oraz dostępność źródeł."}
      </div>
      {sources.size > 0 && (
        <div className="source-activity">
          {[...sources.values()].map((source) => (
            <div
              key={source.provider}
              className={`source-state source-${interrupted && source.status === "running" ? "partial" : source.status}`}
            >
              <span>{providerLabels[source.provider]}</span>
              <small>
                {
                  {
                    running: interrupted ? "Przerwano" : "Pobieranie…",
                    ok: "Pobrano wyniki",
                    empty: "Brak wyników",
                    partial: "Niepełne wyniki",
                    error: "Niedostępne",
                    not_applicable: "Nie wybrano",
                  }[source.status]
                }
                {providerCounts &&
                  ` · do analizy: ${providerCounts.get(source.provider) ?? 0}`}
              </small>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <details className="activity-details">
          <summary>
            Dziennik aktywności <span>{events.length} zdarzeń</span>
          </summary>
          <ol>
            {events.map((event, index) => (
              <li key={index}>
                <time>{event.seconds} s</time>
                <span>
                  {event.type === "stage"
                    ? stageLabels[event.stage]
                    : `${providerLabels[event.source.provider]} · ${{ running: "pobieranie", ok: "pobrano materiały", empty: "brak wyników", partial: "niepełne dane", error: "niedostępne", not_applicable: "nie wybrano dla tego tematu" }[event.source.status]}`}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
