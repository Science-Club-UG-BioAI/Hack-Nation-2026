const warsawDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function verificationDate(timestamp: number): string {
  return warsawDate.format(timestamp);
}
