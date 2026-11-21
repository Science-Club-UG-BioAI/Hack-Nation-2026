export const allowedSourceDomains = [
  "demagog.org.pl",
  "euvsdisinfo.eu",
  "gov.pl",
] as const;

export function isAllowedSourceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
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
}
