import { load } from "cheerio";
import type { SearchHit } from "@/core/evidence";
import { googleWebSearch } from "./google-web";
import { readBoundedText } from "./read-body";
import { htmlText, type SourceBatch } from "./source-adapters";

const domain = "demagog.org.pl";
const maxResults = 3;
const base = `https://${domain}`;

function articleUrl(value: string) {
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      (url.hostname !== domain && url.hostname !== `www.${domain}`)
    )
      return undefined;
    url.hostname = domain;
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return undefined;
  }
}

async function readArticle(
  url: string,
  title: string,
  signal: AbortSignal,
): Promise<SearchHit> {
  const response = await fetch(url, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "text/html" },
  });
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("Demagog article unavailable");
  const $ = load(
    await readBoundedText(
      response.body,
      3_000_000,
      new Error("Demagog article too large"),
      signal,
    ),
  );
  const markup = $("article").first().html() ?? $("main").first().html();
  const content = markup ? htmlText(markup) : "";
  if (content.length < 80) throw new Error("No usable Demagog article text");
  const visibleDate = $(".dg-post__info")
    .first()
    .text()
    .match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  const publishedAt =
    $("meta[property='article:published_time']").attr("content") ||
    (visibleDate
      ? `${visibleDate[3]}-${visibleDate[2]}-${visibleDate[1]}`
      : undefined);
  return demagogHit(
    url,
    $("meta[property='og:title']").attr("content")?.trim() || title,
    content,
    publishedAt,
    $("meta[property='article:modified_time']").attr("content"),
  );
}

function demagogHit(
  url: string,
  title: string,
  content: string,
  publishedAt?: string,
  updatedAt?: string,
): SearchHit {
  return {
    provider: "demagog",
    url,
    title,
    raw_content: content,
    published_date: publishedAt,
    updatedAt,
    publisher: "Stowarzyszenie Demagog",
    publisherGroup: domain,
    sourceType: "web",
    contentScope: "text",
  };
}

export async function demagog(
  query: string,
  signal: AbortSignal,
): Promise<SourceBatch> {
  const terms = query
    .replace(/["“”„‟«»]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const results = await googleWebSearch(
    `${terms} site:${domain}`,
    "demagog",
    maxResults,
    signal,
  );
  const candidates = new Map<string, string>();
  for (const item of results) {
    const url = articleUrl(item.link);
    if (url && !candidates.has(url)) candidates.set(url, item.title);
    if (candidates.size === maxResults) break;
  }
  const links = [...candidates].map(([url, title]) => ({
    url,
    title: title.slice(0, 300),
  }));
  const articles = await Promise.allSettled(
    links.map(({ url, title }) => readArticle(url, title, signal)),
  );
  signal.throwIfAborted();
  const unavailableArticles = links.filter(
    (_, index) => articles[index].status === "rejected",
  );
  return {
    hits: articles.flatMap((article) =>
      article.status === "fulfilled" ? [article.value] : [],
    ),
    partial: unavailableArticles.length > 0,
    ...(unavailableArticles.length ? { unavailableArticles } : {}),
  };
}
