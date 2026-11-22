import { load } from "cheerio";
import type { SearchHit } from "@/core/evidence";
import { z } from "zod";
import { maskPersonalData } from "@/core/privacy";
import { startCall } from "./config";
import { readBoundedText } from "./read-body";
import { htmlText, type SourceBatch } from "./source-adapters";

const domain = "demagog.org.pl";
const maxResults = 3;
const base = `https://${domain}`;

const searchResponse = z.object({
  organic: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
      }),
    )
    .default([]),
});

async function searchArticles(query: string, signal: AbortSignal) {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) throw new Error("Missing Serper API key");
  startCall("demagog");
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    signal,
    redirect: "error",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({
      q: maskPersonalData(query).text,
      gl: "pl",
      hl: "pl",
      num: maxResults,
    }),
  });
  if (!response.ok || !response.body)
    throw new Error("Google search via Serper unavailable");
  const body = await readBoundedText(
    response.body,
    250_000,
    new Error("Search response too large"),
    signal,
  );
  return searchResponse.parse(JSON.parse(body)).organic;
}

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
  const results = await searchArticles(`${terms} site:${domain}`, signal);
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
