/** Expiry policy uses whole calendar days in Asia/Karachi, never host-local time. */
export const businessDate = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const expiryThreshold = (
  settings: { expiryDays?: unknown } | null | undefined,
): number =>
  typeof settings?.expiryDays === "number" &&
  Number.isSafeInteger(settings.expiryDays) &&
  settings.expiryDays >= 0
    ? settings.expiryDays
    : 90;
export function normalizeExpiry(value: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    const first = new Date(value + "-01T12:00:00Z");
    first.setUTCMonth(first.getUTCMonth() + 1);
    first.setUTCDate(0);
    return first.toISOString().slice(0, 10);
  }
  return value;
}
export function expiryStatus(
  value: string,
  threshold: number,
  asOf = businessDate(),
) {
  const expiry = normalizeExpiry(value);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(expiry) &&
    Number.isFinite(Date.parse(expiry + "T00:00:00Z")) &&
    new Date(expiry + "T00:00:00Z").toISOString().slice(0, 10) === expiry;
  const days = valid
    ? Math.round(
        (Date.parse(expiry + "T00:00:00Z") - Date.parse(asOf + "T00:00:00Z")) /
          86400000,
      )
    : null;
  const status =
    days === null
      ? "INVALID"
      : days < 0
        ? "EXPIRED"
        : days === 0
          ? "TODAY"
          : days <= threshold
            ? "SOON"
            : "NORMAL";
  return {
    expiry,
    days,
    status,
    blocked: days === null || days <= 0,
    requiresAcknowledgement: days !== null && days > 0 && days <= threshold,
  };
}
