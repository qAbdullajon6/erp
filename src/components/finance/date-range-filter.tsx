"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateRangeMeta, dateRangeOrder, type DateRangeOption } from "@/lib/date-range";

export interface CustomRange {
  start: string;
  end: string;
}

export function DateRangeFilter({
  option,
  onOptionChange,
  custom,
  onCustomChange,
}: {
  option: DateRangeOption;
  onOptionChange: (option: DateRangeOption) => void;
  custom: CustomRange;
  onCustomChange: (custom: CustomRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={option} onValueChange={(v) => onOptionChange(v as DateRangeOption)}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dateRangeOrder.map((o) => (
            <SelectItem key={o} value={o}>
              {dateRangeMeta[o].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {option === "custom" && (
        <>
          <Input
            type="date"
            className="w-40"
            value={custom.start}
            onChange={(e) => onCustomChange({ ...custom, start: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            value={custom.end}
            onChange={(e) => onCustomChange({ ...custom, end: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
