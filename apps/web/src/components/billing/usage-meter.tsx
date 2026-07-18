import { cn } from "@/lib/utils";
import type { MetricUsage } from "@/lib/api/billing";

/// A single quota row: label, used-of-limit, and a proportional bar. Colour is
/// a threshold signal (approaching/over the limit), never the only cue — the
/// numeric "used / limit" text carries the same information for anyone who
/// can't distinguish the bar colour.
export function UsageMeter({ metric }: { metric: MetricUsage }) {
  const pct = metric.isUnlimited ? 0 : Math.min(100, Math.max(0, metric.percentageUsed));
  const over = !metric.isUnlimited && metric.limit !== null && metric.currentUsage >= metric.limit;
  const near = !metric.isUnlimited && pct >= 80;

  const barTone = over ? "bg-destructive" : near ? "bg-warning" : "bg-brand";

  const limitText = metric.isUnlimited
    ? "Unlimited"
    : `${metric.currentUsage.toLocaleString("en-US")} / ${(metric.limit ?? 0).toLocaleString("en-US")} ${metric.unit}`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{metric.label}</span>
        <span
          className={cn(
            "text-sm tabular-nums",
            over ? "text-destructive font-medium" : near ? "text-warning" : "text-muted-foreground",
          )}
        >
          {limitText}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        {metric.isUnlimited ? (
          <div className="h-full w-full bg-brand/25" />
        ) : (
          <div
            className={cn("h-full rounded-full transition-all", barTone)}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        )}
      </div>
      {over ? (
        <p className="mt-1 text-xs text-destructive">Over plan limit — upgrade to raise this quota.</p>
      ) : near ? (
        <p className="mt-1 text-xs text-warning">Approaching plan limit.</p>
      ) : null}
    </div>
  );
}
