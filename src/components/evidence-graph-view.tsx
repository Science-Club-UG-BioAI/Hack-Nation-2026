"use client";

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useRef, useState } from "react";
import { verdictLabels } from "@/core/contracts";
import {
  edgeTypes,
  nodeLabels,
  nodeTypes,
  relationLabels,
  reviewDecisions,
  semanticLabels,
  type EvidenceGraph,
  type EvidenceNode,
} from "@/core/evidence-graph";

const colors = {
  CLAIM: "#624889",
  DOCUMENT: "#56616e",
  EVIDENCE: "#176866",
  INFERENCE: "#2159a0",
  VERDICT: "#182c43",
};
const edgeColors = {
  SUPPORTS: "#187048",
  CONTRADICTS: "#b52f40",
  CONTEXTUALIZES: "#9c5e05",
};
const directionLabels = {
  all: "Wszystkie kierunki",
  incoming: "Do wybranego elementu",
  outgoing: "Od wybranego elementu",
};
const short = (text: string) =>
  text.length > 53 ? `${text.slice(0, 51)}…` : text;
const nodeTitle = (node: EvidenceNode) =>
  node.type === "VERDICT" ? verdictLabels[node.verdict] : node.text;

function download(content: Blob | string, filename: string) {
  const url =
    typeof content === "string" ? content : URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  if (typeof content !== "string")
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function connected(graph: EvidenceGraph, id: string) {
  const current = graph.nodes.find((node) => node.id === id);
  const selected = new Set([id]);
  const visit = (start: string) => {
    for (const edge of graph.edges) {
      if (
        edge.from !== start ||
        selected.has(edge.id) ||
        !["DEPENDS_ON", "DERIVED_FROM", "EXTRACTED_FROM", "EVALUATES"].includes(
          edge.type,
        )
      )
        continue;
      if (current?.type === "VERDICT" && edge.validation.semantic !== "ACCEPT")
        continue;
      selected.add(edge.id);
      selected.add(edge.to);
      if (edge.type !== "EVALUATES") visit(edge.to);
    }
  };
  if (current?.type === "VERDICT" || current?.type === "INFERENCE") visit(id);
  for (const edge of graph.edges) {
    if (
      edge.id !== id &&
      (current?.type === "VERDICT" || (edge.from !== id && edge.to !== id))
    )
      continue;
    selected.add(edge.id);
    selected.add(edge.from);
    selected.add(edge.to);
    if (
      current?.type === "CLAIM" &&
      edge.to === id &&
      ["SUPPORTS", "CONTRADICTS", "CONTEXTUALIZES"].includes(edge.type)
    )
      visit(edge.from);
  }
  return selected;
}

export function EvidenceGraphView({ graph }: { graph: EvidenceGraph }) {
  const canvas = useRef<HTMLDivElement>(null);
  const network = useRef<Core | null>(null);
  const [selection, select] = useState("verdict");
  const [nodeType, setNodeType] = useState("");
  const [edgeType, setEdgeType] = useState("");
  const [semantic, setSemantic] = useState("");
  const [direction, setDirection] =
    useState<keyof typeof directionLabels>("all");
  const [displayFailed, setDisplayFailed] = useState(false);
  const node = graph.nodes.find((item) => item.id === selection);
  const edge = graph.edges.find((item) => item.id === selection);
  const anchor = node?.id ?? edge?.from;
  const review = graph.reviews.find((item) => item.targetId === selection);
  const origin =
    node?.type === "DOCUMENT"
      ? node
      : node?.type === "EVIDENCE"
        ? graph.nodes.find(
            (item) => item.type === "DOCUMENT" && item.id === node.documentId,
          )
        : undefined;
  const savedChunk =
    node?.type === "EVIDENCE"
      ? graph.citedChunks.find(
          (chunk) =>
            chunk.documentId === node.documentId &&
            chunk.chunkId === node.chunkId,
        )
      : undefined;
  const fit = () => {
    const cy = network.current;
    if (cy?.elements(":visible").length) cy.fit(cy.elements(":visible"), 25);
  };
  useEffect(() => {
    if (!canvas.current) return;
    const elements: ElementDefinition[] = [
      ...graph.nodes.map((item) => ({
        data: {
          id: item.id,
          label: `${nodeLabels[item.type]}\n${short(nodeTitle(item))}`,
          color: colors[item.type],
        },
      })),
      ...graph.edges.map((item) => ({
        data: {
          id: item.id,
          source: item.from,
          target: item.to,
          label: relationLabels[item.type],
          color: edgeColors[item.type as keyof typeof edgeColors] ?? "#64748b",
        },
        classes: item.validation.semantic === "ACCEPT" ? "" : "unverified",
      })),
    ];
    let cy: Core;
    try {
      cy = cytoscape({
        elements,
        container: canvas.current,
        minZoom: 0.12,
        maxZoom: 2.5,
        boxSelectionEnabled: false,
        autoungrabify: false,
        layout: {
          name: "breadthfirst",
          directed: true,
          roots: ["verdict"],
          spacingFactor: 1.35,
          padding: 24,
        },
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "background-color": "data(color)",
              color: "#fff",
              shape: "round-rectangle",
              width: 172,
              height: 55,
              "font-size": 12,
              "text-wrap": "wrap",
              "text-max-width": "158px",
              "text-valign": "center",
              "text-halign": "center",
            },
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "curve-style": "bezier",
              "line-color": "data(color)",
              "target-arrow-color": "data(color)",
              "target-arrow-shape": "triangle",
              label: "data(label)",
              color: "#1f2937",
              "font-size": 10,
              "text-background-color": "#fff",
              "text-background-opacity": 0.9,
              "text-background-padding": "2px",
            },
          },
          {
            selector: "edge.unverified",
            style: {
              "line-style": "dashed",
              "line-color": "#a45f00",
              "target-arrow-color": "#a45f00",
            },
          },
          { selector: ".muted", style: { opacity: 0.24 } },
          {
            selector: "node.focused",
            style: { "border-width": 4, "border-color": "#f1ae27" },
          },
          { selector: "edge.focused", style: { width: 5 } },
          { selector: ".filtered", style: { display: "none" } },
        ],
      });
    } catch {
      setDisplayFailed(true);
      return;
    }
    network.current = cy;
    cy.on("tap", "node, edge", (event) => select(event.target.id()));
    cy.on("tap", (event) => {
      if (event.target === cy) select("");
    });
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(canvas.current);
    return () => {
      observer.disconnect();
      cy.destroy();
      network.current = null;
    };
  }, [graph]);

  const visibleNodes = graph.nodes.filter(
    (item) =>
      (!nodeType || item.type === nodeType) &&
      (!semantic || item.validation.semantic === semantic),
  );
  const allByType = new Set(
    graph.nodes
      .filter((item) => !nodeType || item.type === nodeType)
      .map((item) => item.id),
  );
  const visibleEdges = graph.edges.filter(
    (item) =>
      (!edgeType || item.type === edgeType) &&
      (!semantic || item.validation.semantic === semantic) &&
      allByType.has(item.from) &&
      allByType.has(item.to) &&
      (direction === "all" ||
        !anchor ||
        (direction === "incoming" ? item.to === anchor : item.from === anchor)),
  );
  const filteredNodes = new Set(visibleNodes.map((item) => item.id));
  const incident = new Set(
    visibleEdges.flatMap((item) => [item.from, item.to]),
  );
  if (edgeType || direction !== "all") {
    for (const id of filteredNodes)
      if (!incident.has(id) && id !== anchor) filteredNodes.delete(id);
  }
  for (const id of incident) filteredNodes.add(id);
  const filteredEdges = new Set(visibleEdges.map((item) => item.id));
  useEffect(() => {
    const cy = network.current;
    if (!cy) return;
    const highlighted = connected(graph, selection);
    cy.batch(() =>
      cy.elements().forEach((item) => {
        item.toggleClass(
          "filtered",
          !(item.isNode() ? filteredNodes : filteredEdges).has(item.id()),
        );
        item.toggleClass("focused", item.id() === selection);
        item.toggleClass(
          "muted",
          Boolean(selection) && !highlighted.has(item.id()),
        );
      }),
    );
  });

  const inspected = node ?? edge;
  return (
    <section className="evidence-graph" aria-label="Graf dowodowy">
      <h3>Graf dowodowy</h3>
      {graph.synthetic && (
        <p className="demo-notice">
          <strong>Dane syntetyczne.</strong> Twierdzenie, dokumenty i cytaty są
          fikcyjne.
        </p>
      )}
      <div className="graph-actions">
        <button type="button" onClick={fit} disabled={displayFailed}>
          Dopasuj widok
        </button>
        <button
          type="button"
          aria-label="Powiększ graf"
          disabled={displayFailed}
          onClick={() =>
            network.current?.zoom((network.current?.zoom() ?? 1) * 1.2)
          }
        >
          +
        </button>
        <button
          type="button"
          aria-label="Pomniejsz graf"
          disabled={displayFailed}
          onClick={() =>
            network.current?.zoom((network.current?.zoom() ?? 1) / 1.2)
          }
        >
          −
        </button>
      </div>
      <details className="result-disclosure">
        <summary>Opcje grafu</summary>
        <div className="graph-controls">
          <label>
            Węzły
            <select
              value={nodeType}
              onChange={(event) => setNodeType(event.target.value)}
            >
              <option value="">Wszystkie typy</option>
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {nodeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Relacje
            <select
              value={edgeType}
              onChange={(event) => setEdgeType(event.target.value)}
            >
              <option value="">Wszystkie typy</option>
              {edgeTypes.map((type) => (
                <option key={type} value={type}>
                  {relationLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={semantic}
              onChange={(event) => setSemantic(event.target.value)}
            >
              <option value="">Wszystkie statusy</option>
              {[...reviewDecisions, "NOT_APPLICABLE" as const].map((status) => (
                <option key={status} value={status}>
                  {semanticLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kierunek
            <select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as keyof typeof directionLabels)
              }
            >
              {Object.entries(directionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="graph-actions">
          <button
            type="button"
            onClick={() =>
              download(
                new Blob([JSON.stringify(graph, null, 2)], {
                  type: "application/json",
                }),
                "graf-dowodowy.json",
              )
            }
          >
            Eksport JSON
          </button>
          <button
            type="button"
            disabled={displayFailed}
            onClick={() => {
              const cy = network.current;
              if (cy?.elements(":visible").length)
                download(
                  cy.png({
                    full: true,
                    bg: "#ffffff",
                    maxWidth: 2400,
                    maxHeight: 2400,
                  }),
                  "graf-dowodowy.png",
                );
            }}
          >
            Eksport PNG
          </button>
        </div>
      </details>
      <div className="graph-legend">
        {Object.entries(edgeColors).map(([type, color]) => (
          <span key={type} style={{ borderColor: color }}>
            {relationLabels[type as keyof typeof edgeColors]}
          </span>
        ))}
        <span className="graph-unverified">
          Przerywana · relacja niezatwierdzona
        </span>
      </div>
      {displayFailed && (
        <p role="status">
          Widok graficzny jest niedostępny. Szczegóły możesz przeglądać z listy.
        </p>
      )}
      <div
        className="graph-canvas"
        ref={canvas}
        aria-hidden="true"
        hidden={displayFailed}
      />
      <label className="graph-element">
        Przejdź do elementu
        <select
          value={
            filteredNodes.has(selection) || filteredEdges.has(selection)
              ? selection
              : ""
          }
          onChange={(event) => select(event.target.value)}
        >
          <option value="">Wybierz węzeł lub relację</option>
          {graph.nodes
            .filter((item) => filteredNodes.has(item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {nodeLabels[item.type]} · {short(nodeTitle(item))}
              </option>
            ))}
          {visibleEdges.map((item) => (
            <option key={item.id} value={item.id}>
              {relationLabels[item.type]} · {item.from} → {item.to}
            </option>
          ))}
        </select>
      </label>
      {inspected && (
        <div className="graph-detail" aria-live="polite">
          <h4>
            {node ? nodeLabels[node.type] : edge && relationLabels[edge.type]}
          </h4>
          {node?.type === "EVIDENCE" ? (
            <blockquote>{node.text}</blockquote>
          ) : (
            <p>{node?.text ?? edge?.reason}</p>
          )}
          <p>
            Technicznie:{" "}
            {inspected.validation.technical === "valid" ? "poprawny" : "błędny"}{" "}
            · Merytorycznie: {semanticLabels[inspected.validation.semantic]}
          </p>
          {review && <p>{review.reason}</p>}
          {node?.type === "INFERENCE" && (
            <p>
              <strong>Przesłanki</strong> · {node.premises}
              {node.missingPremises > 0 &&
                ` · Brakujące przesłanki: ${node.missingPremises}`}
            </p>
          )}
          {node?.type === "VERDICT" && (
            <>
              <p>
                <strong>{verdictLabels[node.verdict]}</strong>
              </p>
              {node.limitations.length > 0 && (
                <ul>
                  {node.limitations.map((limit, index) => (
                    <li key={index}>{limit}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {origin?.type === "DOCUMENT" && (
            <div>
              <p>
                <strong>{origin.title}</strong> · {origin.publisher} ·{" "}
                {origin.publishedAt ?? "Brak daty publikacji"}
              </p>
              <p>
                Zakres · {origin.contentScope} · Pobrano · {origin.retrievedAt}
              </p>
              {node?.type === "EVIDENCE" && (
                <p>
                  Fragment {node.chunkId} · znaki {node.start}–{node.end}
                </p>
              )}
              {node?.type === "EVIDENCE" && savedChunk && (
                <details>
                  <summary>Pokaż zapisany fragment źródła</summary>
                  <p>
                    {savedChunk.text.slice(0, node.start)}
                    <mark>{node.text}</mark>
                    {savedChunk.text.slice(node.end)}
                  </p>
                  <p>
                    SHA-256 fragmentu · <code>{node.chunkHash}</code>
                  </p>
                </details>
              )}
              {node?.type === "DOCUMENT" && (
                <p>
                  SHA-256 migawki · <code>{node.version}</code>
                </p>
              )}
              {!graph.synthetic && (
                <a href={origin.url} target="_blank" rel="noreferrer noopener">
                  Otwórz dokument źródłowy
                </a>
              )}
            </div>
          )}
          <div className="graph-actions">
            {graph.edges
              .filter(
                (item) =>
                  item.from === node?.id &&
                  [
                    "DERIVED_FROM",
                    "DEPENDS_ON",
                    "EXTRACTED_FROM",
                    "EVALUATES",
                  ].includes(item.type),
              )
              .map((item) => {
                const next = graph.nodes.find(
                  (candidate) => candidate.id === item.to,
                )!;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(next.id)}
                  >
                    {relationLabels[item.type]} · {short(nodeTitle(next))}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}
