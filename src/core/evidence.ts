import { interleave } from "./interleave";
import { createHash } from "node:crypto";
import {
  assessmentSchema,
  type Assessment,
  type Document,
  type SourceMetadata,
  type Source,
  type VerificationResult,
} from "./contracts";
import { getDomain } from "tldts";
import { invalidOutput } from "./errors";
import { isFactCheckingArticle } from "./source-policy";

export type SearchHit = {
  title: string;
  url: string;
  raw_content?: string | null;
  published_date?: string | null;
  retrievedAt?: string;
} & SourceMetadata;
export const normalize = (text: string) =>
  text.normalize("NFC").replace(/\s+/gu, " ").trim();

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key))
        url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function publisherGroup(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  // Language editions and official government subdomains are not independent publishers.
  if (host === "gov.pl" || host.endsWith(".gov.pl")) return "gov.pl";
  return getDomain(host) || host;
}

function shingles(text: string): Set<string> {
  const words = normalize(text).toLowerCase().split(" ").slice(0, 5000);
  const result = new Set<string>();
  for (let i = 0; i + 5 <= words.length; i++)
    result.add(words.slice(i, i + 5).join(" "));
  return result;
}

const knownDate = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? value : null;

export function freshnessWarning(source: Source, claim: string, asOf: string) {
  const current =
    /(?<!\p{L})(?:dziś|dzisiaj|wczoraj|obecnie|aktualnie|ostatnio|teraz|w tym roku|w tym miesiącu|w tym tygodniu)(?!\p{L})/iu.test(
      claim,
    );
  const years = new Set(claim.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const year = years.size === 1 ? [...years][0] : undefined;
  const period = source.eventPeriod;
  const day = asOf.slice(0, 10);
  const explicitDays = claim.match(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g) ?? [];
  const targetDay =
    explicitDays.length === 1
      ? explicitDays[0]
      : /(?<!\p{L})(dziś|dzisiaj)(?!\p{L})/iu.test(claim)
        ? day
        : null;
  if (
    targetDay &&
    period &&
    ((period.from && period.from.slice(0, 10) > targetDay) ||
      (period.to && period.to.slice(0, 10) < targetDay))
  )
    return "Opisany okres zdarzenia nie obejmuje dnia wskazanego w tezie.";
  if (
    year &&
    period &&
    ((period.from && period.from.slice(0, 4) > year) ||
      (period.to && period.to.slice(0, 4) < year))
  )
    return "Opisany okres zdarzenia nie obejmuje roku wskazanego w tezie.";
  if (!current) return null;
  if (period?.from && period.from.slice(0, 10) > day)
    return "Opisane zdarzenie przypada po dacie wypowiedzi.";
  const date = period?.to ?? source.updatedAt ?? source.publishedAt;
  if (!date) return "Brak daty pozwalającej ocenić aktualność materiału.";
  if (Date.parse(asOf) - Date.parse(date) > 365 * 86_400_000)
    return "Materiał archiwalny względem daty tezy. Sprawdź, czy opisany stan nadal obowiązywał.";
  return null;
}

export function describeStrength(
  result: VerificationResult,
): NonNullable<VerificationResult["strength"]> {
  const cited = result.sources.filter((s) =>
    result.evidence.some((e) => e.sourceId === s.id),
  );
  const groups = new Set(
    cited.map((s) => s.publisherGroup || publisherGroup(s.url)),
  ).size;
  const limitations = [
    "Grupujemy według domen wydawców. Serwisy gov.pl liczymy łącznie, a różne domeny mogą powtarzać tę samą informację.",
  ];
  if (groups === 1)
    limitations.push("Wszystkie cytaty pochodzą z jednej grupy wydawców.");
  if (result.evidenceConflict)
    limitations.push(
      "Cytowane materiały zawierają nierozstrzygniętą sprzeczność.",
    );
  if (cited.some((s) => s.freshnessWarning))
    limitations.push(
      "Co najmniej jedno cytowane źródło wymaga sprawdzenia okresu, którego dotyczy.",
    );
  if (
    cited.some(
      (s) => s.contentScope === "metadata" || s.contentScope === "abstract",
    )
  )
    limitations.push("Część podstawy obejmuje tylko metadane lub abstrakt.");
  return {
    independentGroups: groups,
    summary: cited.length
      ? `Liczba cytowanych źródeł wynosi ${cited.length}, a liczba reprezentowanych grup wydawców wynosi ${groups}.`
      : "Brak cytowanych źródeł.",
    limitations,
  };
}

function isNearCopy(a: Set<string>, b: Set<string>) {
  if (Math.min(a.size, b.size) < 25) return false;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap++;
  return overlap / Math.min(a.size, b.size) > 0.85;
}

function selectPassages(raw: string, terms: string[]) {
  const paragraphs = raw
    .split(/\n\s*\n/u)
    .flatMap((p) => p.match(/[\s\S]{1,1800}/gu) ?? [])
    .map((text, index) => {
      const lower = text.toLocaleLowerCase("pl");
      return {
        text: text.trim(),
        index,
        score: terms.reduce(
          (sum, term) => sum + Number(lower.includes(term)),
          0,
        ),
      };
    })
    .filter((p) => p.text.length >= 12)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  let budget = 4000;
  const selected: { text: string; index: number }[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.text.length > budget) continue;
    selected.push(paragraph);
    budget -= paragraph.text.length;
  }
  return selected.sort((a, b) => a.index - b.index);
}

// Preserve exact source text in selected passages; never treat search summaries as evidence.
export function prepareDocuments(
  hits: SearchHit[],
  claim: string,
  retrievedAt: string,
): Document[] {
  const urls = new Set<string>();
  const hashes = new Set<string>();
  const seenTexts: Set<string>[] = [];
  const groupCounts = new Map<string, number>();
  const terms =
    normalize(claim)
      .toLocaleLowerCase("pl")
      .match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const documents: Document[] = [];
  // Round-robin publisher groups so the first search cannot consume the entire budget.
  const buckets = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const url = safeUrl(hit.canonicalUrl || hit.url);
    if (!url) continue;
    const group = hit.publisherGroup || publisherGroup(url);
    const bucket = buckets.get(group);
    if (bucket) bucket.push(hit);
    else buckets.set(group, [hit]);
  }
  for (const hit of interleave([...buckets.values()])) {
    const url = safeUrl(hit.url);
    const identity = safeUrl(hit.canonicalUrl || hit.url);
    const raw = hit.raw_content?.slice(0, 150_000);
    if (
      !url ||
      !identity ||
      !raw ||
      normalize(raw).length < 40 ||
      urls.has(identity)
    )
      continue;
    const group = hit.publisherGroup || publisherGroup(identity);
    if ((groupCounts.get(group) ?? 0) >= 3) continue;
    const hash = createHash("sha256").update(normalize(raw)).digest("hex");
    if (hashes.has(hash)) continue;
    const signature = shingles(raw);
    if (seenTexts.some((previous) => isNearCopy(signature, previous))) continue;
    const selected = selectPassages(raw, terms);
    if (!selected.length) continue;
    seenTexts.push(signature);
    urls.add(identity);
    hashes.add(hash);
    const id = `s${documents.length + 1}`;
    const published = knownDate(hit.published_date);
    const from = knownDate(hit.eventPeriod?.from);
    const to = knownDate(hit.eventPeriod?.to);
    documents.push({
      id,
      title: hit.title.slice(0, 300),
      url,
      publishedAt: published,
      updatedAt: knownDate(hit.updatedAt),
      eventPeriod:
        (from || to) && !(from && to && Date.parse(from) > Date.parse(to))
          ? { from, to }
          : null,
      publisher: hit.publisher || new URL(identity).hostname,
      publisherIsDomain: !hit.publisher || hit.publisherIsDomain === true,
      freshnessWarning: hit.freshnessWarning ?? null,
      retrievedAt: knownDate(hit.retrievedAt) ?? retrievedAt,
      provider: hit.provider ?? "web",
      sourceType: hit.sourceType ?? (group === "gov.pl" ? "official" : "web"),
      contentScope: hit.contentScope ?? "text",
      publisherGroup: group,
      canonicalUrl: identity,
      notes: hit.notes ?? [],
      chunks: selected.map((p) => ({ id: `${id}:p${p.index}`, text: p.text })),
    });
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    if (documents.length === 10) break;
  }
  return documents;
}

function hasDirectFactCheck(assessment: Assessment, documents: Document[]) {
  const relation =
    assessment.verdict === "supported" ? "supports" : "contradicts";
  return (
    ["supported", "refuted"].includes(assessment.verdict) &&
    documents.some(
      (doc) =>
        doc.contentScope === "text" &&
        isFactCheckingArticle(doc.url) &&
        assessment.evidence.some(
          (e) => e.sourceId === doc.id && e.relation === relation,
        ),
    )
  );
}

export function evidenceCoverage(
  assessment: Assessment,
  documents: Document[],
) {
  const sources = documents.filter((d) =>
    assessment.evidence.some((e) => e.sourceId === d.id),
  );
  return {
    citedSources: sources.length,
    publisherGroups: new Set(
      sources.map((d) => d.publisherGroup || publisherGroup(d.url)),
    ).size,
    reviewedSources: documents.length,
    minimumGroups: hasDirectFactCheck(assessment, documents) ? 1 : 2,
  };
}

export function hasCorroboration(
  assessment: Assessment,
  documents: Document[],
) {
  if (!["supported", "refuted"].includes(assessment.verdict)) return true;
  if (hasDirectFactCheck(assessment, documents)) return true;
  const relation =
    assessment.verdict === "supported" ? "supports" : "contradicts";
  const relevant = {
    ...assessment,
    evidence: assessment.evidence.filter((e) => e.relation === relation),
  };
  return (
    evidenceCoverage(
      relevant,
      documents.filter((doc) => doc.provider !== "google_factcheck"),
    ).publisherGroups >= 2
  );
}

export function requireCorroboration(
  assessment: Assessment,
  documents: Document[],
): Assessment {
  if (hasCorroboration(assessment, documents)) return assessment;
  return {
    ...assessment,
    verdict: "insufficient",
    explanation:
      "Znaleziono dowody odnoszące się do tezy, ale zabrakło potwierdzenia oceny w co najmniej dwóch różnych grupach źródeł. Poniżej pokazujemy dostępne materiały.\n\n" +
      assessment.explanation,
    limitations: [
      ...assessment.limitations,
      "Ograniczona podstawa oceny: kilka cytatów lub stron jednego wydawcy nie stanowi dodatkowego potwierdzenia. Różne domeny również nie gwarantują niezależności informacji.",
    ],
  };
}

export function validateAssessment(
  value: unknown,
  documents: Document[],
): Assessment {
  const parsed = assessmentSchema.safeParse(value);
  if (!parsed.success)
    throw invalidOutput(["Response does not match the assessment schema."]);
  const result = parsed.data;
  const issues: string[] = [];
  for (const [index, item] of result.evidence.entries()) {
    const document = documents.find((d) => d.id === item.sourceId);
    const chunk = document?.chunks.find((c) => c.id === item.chunkId);
    if (!document) issues.push(`evidence[${index}]: sourceId does not exist.`);
    else if (!chunk)
      issues.push(
        `evidence[${index}]: chunkId does not belong to this source.`,
      );
    else if (!normalize(chunk.text).includes(normalize(item.quote)))
      issues.push(
        `evidence[${index}]: quote is not an exact contiguous substring of the referenced chunk. Copy a shorter exact passage including original punctuation/Markdown, or remove this item.`,
      );
  }
  if (issues.length) throw invalidOutput(issues);
  const has = (relation: string) =>
    result.evidence.some((e) => e.relation === relation);
  if (result.verdict === "supported" && !has("supports"))
    throw invalidOutput(["supported requires supporting evidence."]);
  if (result.verdict === "refuted" && !has("contradicts"))
    throw invalidOutput(["refuted requires contradicting evidence."]);
  if (
    result.verdict === "misleading" &&
    !(has("context") || has("contradicts"))
  )
    throw invalidOutput([
      "misleading requires evidence of the missing or distorted context.",
    ]);
  if (
    result.evidenceConflict &&
    (result.verdict !== "insufficient" ||
      !(has("supports") && has("contradicts")))
  )
    throw invalidOutput([
      "An unresolved evidenceConflict requires insufficient and both supporting and contradicting evidence.",
    ]);
  return result;
}
