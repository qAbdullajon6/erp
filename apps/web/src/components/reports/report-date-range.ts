export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  dateFrom: string;
  dateTo: string;
}

function toDateString(date: Date): string {
  // Local calendar day — toISOString() is UTC and shifts the date for
  // orgs east of UTC (e.g. Asia/Tashkent) when picking "Today".
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function resolvePreset(preset: DateRangePreset, custom?: { dateFrom: string; dateTo: string }): DateRangeValue {
  const now = new Date();
  const today = toDateString(now);

  switch (preset) {
    case 'today':
      return { preset, dateFrom: today, dateTo: today };
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const key = toDateString(yesterday);
      return { preset, dateFrom: key, dateTo: key };
    }
    case 'last_7_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { preset, dateFrom: toDateString(from), dateTo: today };
    }
    case 'last_30_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { preset, dateFrom: toDateString(from), dateTo: today };
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { preset, dateFrom: toDateString(from), dateTo: today };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { preset, dateFrom: toDateString(from), dateTo: toDateString(to) };
    }
    case 'custom':
      return { preset, dateFrom: custom?.dateFrom ?? today, dateTo: custom?.dateTo ?? today };
  }
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range',
};
