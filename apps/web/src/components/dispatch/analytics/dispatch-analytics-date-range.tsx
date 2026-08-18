'use client';

import { Input } from '@/components/ui/input';
import {
  DATE_RANGE_PRESET_LABELS,
  type DateRangePreset,
  type DateRangeValue,
} from '@/components/reports/report-date-range';

/// Same preset vocabulary and resolution logic as Reports (report-date-range.ts —
/// extended there with 'yesterday'/'last_month' for both consumers to share, one
/// definition of what each preset means). The button row itself is local:
/// Dispatch Analytics wants all seven presets Reports' own picker doesn't show,
/// so reusing Reports' <DateRangeFilter> directly isn't an option without
/// changing Reports' UI, which is out of scope for this module.
const PRESETS: DateRangePreset[] = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'custom',
];

interface Props {
  value: DateRangeValue;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (dateFrom: string, dateTo: string) => void;
}

export function DispatchAnalyticsDateRange({ value, onPresetChange, onCustomChange }: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"
      role="group"
      aria-label="Dispatch analytics date range"
    >
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value.preset === preset}
            data-testid={`analytics-range-${preset}`}
            onClick={() => onPresetChange(preset)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              value.preset === preset
                ? 'bg-brand text-brand-foreground'
                : 'bg-background text-muted-foreground hover:bg-brand/10 hover:text-brand'
            }`}
          >
            {DATE_RANGE_PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Custom range start"
            value={value.dateFrom}
            max={value.dateTo}
            onChange={(e) => onCustomChange(e.target.value, value.dateTo)}
            className="h-8 w-auto text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="Custom range end"
            value={value.dateTo}
            min={value.dateFrom}
            onChange={(e) => onCustomChange(value.dateFrom, e.target.value)}
            className="h-8 w-auto text-xs"
          />
        </div>
      )}
    </div>
  );
}
