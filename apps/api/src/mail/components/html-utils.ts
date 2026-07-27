/// Shared HTML-building helpers for every email template. Every component in
/// this directory trusts its callers to have already escaped any
/// user-supplied text before passing it in as `children`/`value` — components
/// interpolate directly and never re-escape, so double-escaping (turning
/// "&amp;" into "&amp;amp;") can't happen by accident. Escape once, at the
/// point where raw data first becomes a string destined for HTML.

/// Minimal HTML entity escaping. Same rule set the two existing invitation
/// templates each defined independently — consolidated here so every
/// template (including those two) shares one implementation.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/// Escapes, then converts newlines to <br> — for multi-line user input (e.g.
/// a lead's free-text message) rendered inside an HTML paragraph. Escaping
/// happens first so a literal "<br>" typed by a visitor can never inject a
/// real line break tag.
export function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

/// Human-readable, timezone-explicit timestamp for "Submitted" fields. Fixed
/// to UTC rather than a guessed local timezone — the server has no reliable
/// signal for the recipient's timezone, and an unlabeled local time is worse
/// than a labeled UTC one.
export function formatEmailDate(date: Date): string {
  const formatted = date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return `${formatted} UTC`;
}

/// Strips the protocol for display text (footer "visit site" link shows
/// "flowerp.uz", not "https://flowerp.uz") while the href keeps the full URL.
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
