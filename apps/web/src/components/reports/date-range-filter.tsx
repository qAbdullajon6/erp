import { Input } from '@/components/ui/input';
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset, type DateRangeValue } from './report-date-range';

interface DateRangeFilterProps {
  value: DateRangeValue;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (dateFrom: string, dateTo: string) => void;
  isFetching?: boolean;
}

const PRESETS: DateRangePreset[] = ['today', 'last_7_days', 'last_30_days', 'this_month', 'custom'];

export function DateRangeFilter({ value, onPresetChange, onCustomChange, isFetching }: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/10 bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => onPresetChange(preset)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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

      {isFetching && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          Updating...
        </span>
      )}
    </div>
  );
}
