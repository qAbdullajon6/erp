import { Input } from '@/components/ui/input';
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset, type DateRangeValue } from './report-date-range';

interface DateRangeFilterProps {
  value: DateRangeValue;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (dateFrom: string, dateTo: string) => void;
}

const PRESETS: DateRangePreset[] = ['today', 'last_7_days', 'last_30_days', 'this_month', 'custom'];

export function DateRangeFilter({ value, onPresetChange, onCustomChange }: DateRangeFilterProps) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-brand/10 bg-surface p-3 sm:p-4"
      role="group"
      aria-label="Report date range"
    >
      {/* One scrollable row rather than a wrapping grid: on a phone these five
          chips wrapped into a five-deep stack that pushed the report itself off
          the first screen. */}
      <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 scrollbar-thin">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value.preset === preset}
            onClick={() => onPresetChange(preset)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
            value={value.dateFrom}
            onChange={(e) => onCustomChange(e.target.value, value.dateTo)}
            className="w-auto"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={value.dateTo}
            onChange={(e) => onCustomChange(value.dateFrom, e.target.value)}
            className="w-auto"
          />
        </div>
      )}
    </div>
  );
}
