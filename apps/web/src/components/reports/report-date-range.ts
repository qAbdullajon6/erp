export type DateRangePreset = 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'custom';

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
    case 'custom':
      return { preset, dateFrom: custom?.dateFrom ?? today, dateTo: custom?.dateTo ?? today };
  }
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  this_month: 'This month',
  custom: 'Custom range',
};
