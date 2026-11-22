import { expect, it } from "vitest";
import type { Document, VerificationResult } from "@/core/contracts";
import { syntheticGraphDemo } from "@/server/demo-graph";
import { validateGraph } from "@/server/graph-validation";
import { projectVerificationGraph } from "@/server/verification-graph";

const quote = "Biblioteka jest czynna w niedziele.";
const document: Document = {
  id: "library",
  url: "https://library.example.org/hours",
  title: "Godziny otwarcia",
  publishedAt: null,
  retrievedAt: "2026-11-20T12:00:00Z",
  chunks: [{ id: "hours", text: `Godziny otwarcia. ${quote}` }],
};
function completed(): Extract<VerificationResult, { status: "completed" }> {
  return {
    requestId: "test-graph",
    checkedAt: document.retrievedAt,
    statedAt: null,
    claim: "Czy biblioteka jest czynna w niedziele?",
    mode: "live",
    status: "completed",
    verdict: "supported",
    explanation: quote,
    limitations: [],
    sources: [document],
    findings: [{ id: "hours", text: quote, evidenceIds: ["citation"] }],
    evidence: [
      {
        id: "citation",
        sourceId: document.id,
        chunkId: "hours",
        quote,
        relation: "supports",
        relevance: "Godziny niedzielne.",
      },
    ],
  };
}

it("projects the published verdict and links it to an exact citation and document", () => {
  const graph = projectVerificationGraph(completed(), [document]);
  expect(graph.validation).toEqual({ technical: "valid", issues: [] });
  expect(graph.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "verdict", verdict: "supported" }),
      expect.objectContaining({
        id: "evidence-1",
        text: quote,
        start: 18,
        end: 18 + quote.length,
      }),
      expect.objectContaining({ id: "document-library", url: document.url }),
    ]),
  );
  expect(graph.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        from: "verdict",
        to: "finding-1",
        type: "DERIVED_FROM",
      }),
      expect.objectContaining({
        from: "finding-1",
        to: "evidence-1",
        type: "DEPENDS_ON",
      }),
      expect.objectContaining({
        from: "evidence-1",
        to: "document-library",
        type: "EXTRACTED_FROM",
      }),
    ]),
  );
});

it("rejects a composition that cites a missing source or replaces the exact quote", () => {
  expect(() => projectVerificationGraph(completed(), [])).toThrow();
  expect(() =>
    projectVerificationGraph(completed(), [
      { ...document, chunks: [{ id: "hours", text: "Inny tekst" }] },
    ]),
  ).toThrow();
});

it("checks exported text and documents against their snapshots", () => {
  const graph = projectVerificationGraph(completed(), [document]);
  graph.citedChunks[0].text = "Zmieniony fragment";
  expect(
    validateGraph(graph, new Map([["document-library", document]])),
  ).toMatchObject({
    technical: "invalid",
    issues: [expect.objectContaining({ targetId: "document-library" })],
  });
});

it("detects a cycle in a path connecting conclusions", () => {
  const graph = projectVerificationGraph(completed(), [document]);
  const finding = graph.nodes.find((node) => node.id === "finding-1")!;
  graph.nodes.push({ ...finding, id: "other-finding" });
  const edge = graph.edges.find((item) => item.type === "DEPENDS_ON")!;
  graph.edges.push(
    { ...edge, id: "cycle-1", from: finding.id, to: "other-finding" },
    { ...edge, id: "cycle-2", from: "other-finding", to: finding.id },
  );
  expect(
    validateGraph(graph, new Map([["document-library", document]])).issues,
  ).toContainEqual(expect.objectContaining({ reason: "Cykl zależności." }));
});

it("retains an insufficient published verdict and labels the synthetic demo", () => {
  const result = {
    ...completed(),
    verdict: "insufficient" as const,
    evidence: [],
    findings: [],
  };
  expect(projectVerificationGraph(result, []).nodes).toContainEqual(
    expect.objectContaining({ type: "VERDICT", verdict: "insufficient" }),
  );
  const demo = syntheticGraphDemo();
  expect(demo.evidenceGraph).toMatchObject({
    synthetic: true,
    validation: { technical: "valid", issues: [] },
  });
});
