export function formatMoney(amount: string | number, currency = 'USD'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    notation: value >= 100000 ? 'compact' : 'standard',
  }).format(value);
}

/// Every money aggregate from Finance/Reports is now keyed by currency
/// (Task 10 Part 2 — the API never blends USD + UZS into one number, and
/// this app has no FX conversion, so the frontend can't collapse them into
/// one number either). Renders each currency present, in order, joined —
/// for the overwhelming common single-currency case this is indistinguishable
/// from the old plain `formatMoney` output.
export function formatMoneyByCurrency(money: Record<string, string> | undefined | null): string {
  if (!money) return '—';
  const entries = Object.entries(money);
  if (entries.length === 0) return formatMoney(0);
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' + ');
}

/// A RANKING/POSITIONING-ONLY heuristic — mirrors apps/api's
/// currency-map.util `dominantAmount()` exactly, for the one place the
/// frontend has the same problem the backend does: a chart axis position is
/// a single number, full stop, and there is no correct way to plot "USD 500
/// + EUR 200" as one bar height without an FX rate. Never render this value
/// as text — formatMoneyByCurrency is what renders the real breakdown (chart
/// tooltips use it). For the overwhelmingly common single-currency case this
/// literally IS the total, so nothing changes visually.
export function dominantAmount(money: Record<string, string> | undefined | null): number {
  if (!money) return 0;
  let max = 0;
  for (const amount of Object.values(money)) {
    const value = Number(amount);
    if (Number.isFinite(value) && Math.abs(value) > Math.abs(max)) max = value;
  }
  return max;
}

/// One short-date format for the whole app — "Jul 17, 2026". Pinned to en-US
/// like the dispatch and leads lists, so the same date never renders in two
/// different locale formats on two different screens.
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/// Date + time — was duplicated identically across three dispatch components
/// (list, detail, create form) before being consolidated here.
export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
