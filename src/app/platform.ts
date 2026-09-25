/** Browser quirks the UI has to account for. */

/**
 * Safari and the other WebKit browsers on Apple devices clear website data more readily than others, so
 * the UI reminds their users to export leagues now and then (spec 21).
 */
export function clearsSiteData(userAgent: string): boolean {
  if (/CriOS\/|FxiOS\/|EdgiOS\//.test(userAgent)) return true;
  return (
    /AppleWebKit\//.test(userAgent) &&
    /Safari\//.test(userAgent) &&
    !/Chrome\/|Chromium\/|Edg\/|OPR\/|Android/.test(userAgent)
  );
}

export const EXPORT_REMINDER =
  "Safari clears website data it hasn't seen in a while. Export your leagues now and then to keep a copy.";
