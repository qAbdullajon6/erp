import type { Currency } from "@/lib/types";

// Centralized currency formatting. Every finance record (Invoice, Payment,
// Expense) stores its own currency and is displayed in that currency only —
// no exchange-rate conversion happens anywhere in this phase. DEFAULT_CURRENCY
// is the single place a future "company default currency" setting would plug
// into; today it's a constant, not a per-tenant preference.
export const DEFAULT_CURRENCY: Currency = "USD";

export const currencyMeta: Record<Currency, { label: string; symbol: string }> = {
  USD: { label: "US Dollar", symbol: "$" },
  UZS: { label: "Uzbek So'm", symbol: "so'm" },
};

export const currencyOrder: Currency[] = ["USD", "UZS"];

export function formatMoney(amount: number, currency: Currency = DEFAULT_CURRENCY): string {
  if (currency === "UZS") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} so'm`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
