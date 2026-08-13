/// TanStack Router's default search parser JSON-parses raw query-string
/// values, so a hand-typed or shared URL like `?search=9001` (no quotes)
/// arrives in `validateSearch` as the number 9001, not the string "9001" —
/// only values written by our own `navigate()` calls come pre-quoted (they
/// get JSON-stringified on the way out). A plain `typeof value === "string"`
/// guard silently drops those numeric-looking terms instead of matching
/// them, which breaks bookmarked/shared links whenever the search text is
/// all digits (an expense/invoice number, a phone number, a plate number).
/// Accepting numbers and coercing them back to strings keeps both paths working.
export function asSearchString(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
