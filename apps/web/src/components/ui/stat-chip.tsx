import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatChipProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: string;
  className?: string;
}

/// The small icon+value+label chip used in ExecutiveSummaryHeader — a
/// lighter-weight sibling of MetricCard for a row of at-a-glance figures
/// that don't need their own full card.
export function StatChip({ label, value, icon: Icon, tone = "text-muted-foreground", className }: StatChipProps) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-brand/10 bg-surface/60 px-4 py-2.5", className)}>
      <Icon className={cn("h-4 w-4 shrink-0", tone)} />
      <div>
        <div className="text-lg font-semibold leading-none text-foreground">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
