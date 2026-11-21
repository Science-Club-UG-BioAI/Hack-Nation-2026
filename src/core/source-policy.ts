export const allowedSourceDomains = [
  "demagog.org.pl",
  "euvsdisinfo.eu",
  "gov.pl",
] as const;

export function isFactCheckingArticle(value: string): boolean {
  if (!isAllowedSourceUrl(value)) return false;
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "demagog.org.pl")
    return /^\/(?:wypowiedzi|fake_news|na-biezaco)\/[^/]+\/?$/.test(
      url.pathname,
    );
  if (host === "euvsdisinfo.eu")
    return /^\/(?:[a-z]{2}\/)?report\/[^/]+\/?$/.test(url.pathname);
  return false;
}

export function isAllowedSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return false;
    const host = url.hostname.replace(/\.$/, "");
    return allowedSourceDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
