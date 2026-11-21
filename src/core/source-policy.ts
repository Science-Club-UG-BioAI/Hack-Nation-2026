export const allowedSourceDomains = [
  "demagog.org.pl",
  "euvsdisinfo.eu",
  "gov.pl",
] as const;
const corpusDomains = [
  ...allowedSourceDomains,
  "cert.pl",
  "esa.int",
  "europa.eu",
  "imgw.pl",
  "kgsok.pl",
  "nasa.gov",
  "nato.int",
  "nbp.pl",
  "policja.pl",
  "portalpasazera.pl",
  "un.org",
  "worldbank.org",
];

export function isAllowedCorpusUrl(value: string): boolean {
  return matchesSourceDomain(value, corpusDomains);
}

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
  return matchesSourceDomain(value, allowedSourceDomains);
}

function matchesSourceDomain(
  value: string,
  domains: readonly string[],
): boolean {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return false;
    const host = url.hostname.replace(/\.$/, "");
    return domains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
