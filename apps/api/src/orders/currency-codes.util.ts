/// Active ISO-4217 currency codes in real trade/logistics use. Not the full
/// ~180-code standard (obsolete/precious-metal/fund codes omitted) — this is
/// a validation allowlist, not a reference table, so it only needs to reject
/// clearly-invalid input like "XYZ" while accepting any currency an order
/// could plausibly be priced in.
export const ACTIVE_ISO_4217_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CNY", "CHF", "CAD", "AUD", "NZD", "HKD",
  "SGD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY",
  "RUB", "UAH", "BYN", "GEL", "AMD", "AZN", "KZT", "KGS", "TJS", "TMT",
  "UZS", "INR", "PKR", "BDT", "LKR", "NPR", "AFN", "IRR", "IQD", "AED",
  "SAR", "QAR", "KWD", "BHD", "OMR", "JOD", "ILS", "EGP", "MAD", "DZD",
  "TND", "LYD", "NGN", "GHS", "KES", "TZS", "UGX", "ZAR", "ETB", "XOF",
  "XAF", "BRL", "MXN", "ARS", "CLP", "COP", "PEN", "UYU", "BOB", "PYG",
  "VES", "IDR", "MYR", "THB", "PHP", "VND", "KRW", "TWD", "MMK", "KHR",
  "LAK", "MNT", "BND",
]);

export function isActiveIso4217Code(value: string): boolean {
  return ACTIVE_ISO_4217_CODES.has(value);
}
