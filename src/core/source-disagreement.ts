import type { VerificationResult } from "./contracts";

const disagreementSides = [
  { relation: "supports", label: "Źródła wspierające twierdzenie" },
  { relation: "contradicts", label: "Źródła przeczące twierdzeniu" },
] as const;

export function sourceDisagreement(result: VerificationResult) {
  if (result.status !== "completed") return [];

  const sources = new Map(result.sources.map((source) => [source.id, source]));
  const citations = result.evidence.flatMap((evidence, index) => {
    const source = sources.get(evidence.sourceId);
    return source ? [{ evidence, number: index + 1, source }] : [];
  });
  const byId = new Map(
    citations.flatMap((citation) =>
      citation.evidence.id ? [[citation.evidence.id, citation] as const] : [],
    ),
  );
  if (
    !citations.some(
      (support) =>
        support.evidence.relation === "supports" &&
        citations.some(
          (opposition) =>
            opposition.evidence.relation === "contradicts" &&
            opposition.source.id !== support.source.id,
        ),
    )
  )
    return [];

  return disagreementSides.map(({ relation, label }) => {
    const covered = new Set<number>();
    const positions = (result.findings ?? []).flatMap((finding) => {
      const referenced = finding.evidenceIds.map((id) => byId.get(id));
      if (
        !referenced.length ||
        referenced.some((citation) => citation?.evidence.relation !== relation)
      )
        return [];
      const sameSide = referenced.filter((citation) => citation !== undefined);
      for (const citation of sameSide) covered.add(citation.number);
      return [
        {
          text: finding.text,
          citations: sameSide,
        },
      ];
    });
    // Older results and citations without a same-side finding can still show
    // the exact passage without attributing an interpretation to the source.
    for (const citation of citations)
      if (
        citation.evidence.relation === relation &&
        !covered.has(citation.number)
      )
        positions.push({
          text: `„${citation.evidence.quote}”`,
          citations: [citation],
        });
    return { relation, label, positions };
  });
}
