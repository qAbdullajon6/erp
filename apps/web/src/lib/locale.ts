/// The currencies and timezones a company can be configured in. Orders, leads
/// and Settings each carried their own list, and they had already drifted —
/// an order could be priced in CNY that a converted lead could not be.

export const CURRENCIES = ['USD', 'EUR', 'UZS', 'RUB', 'KZT', 'GBP', 'CNY'] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  UZS: 'Uzbek Som',
  RUB: 'Russian Ruble',
  KZT: 'Kazakhstani Tenge',
  GBP: 'British Pound',
  CNY: 'Chinese Yuan',
};

/// `code` keeps whatever the workspace is already set to selectable, even if it
/// is not one of ours — changing an unrelated setting must not silently
/// re-denominate the company.
export function currencyOptions(code?: string): { value: string; label: string }[] {
  const codes = new Set<string>(CURRENCIES);
  if (code) codes.add(code);
  return [...codes].map((value) => ({
    value,
    label: CURRENCY_NAMES[value] ? `${value} — ${CURRENCY_NAMES[value]}` : value,
  }));
}

/// Zones a logistics operator in this product's markets actually runs in, used
/// when the browser cannot enumerate the full IANA set.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Tashkent',
  'Asia/Samarkand',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Dushanbe',
  'Asia/Ashgabat',
  'Asia/Baku',
  'Asia/Tbilisi',
  'Asia/Dubai',
  'Asia/Shanghai',
  'Asia/Istanbul',
  'Europe/Moscow',
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
];

export function timezoneOptions(current?: string): { value: string; label: string }[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function'
      ? (Intl.supportedValuesOf('timeZone') as string[])
      : FALLBACK_TIMEZONES;
  const zones = new Set<string>(['UTC', ...supported]);
  if (current) zones.add(current);
  return [...zones].sort().map((value) => ({ value, label: value.replace(/_/g, ' ') }));
}
