'use client';

import { cn } from '@/lib/utils';
import type {
  TelematicsAnalyticsOverview,
  TelematicsFuelAnalytics,
  TelematicsHealthRow,
} from '@/lib/api/telematics';

interface Props {
  overview?: TelematicsAnalyticsOverview | null;
  fuel?: TelematicsFuelAnalytics | null;
  healthRows?: TelematicsHealthRow[] | null;
  loading?: boolean;
  errorMessage?: string | null;
}

export function FleetAnalyticsStrip({
  overview,
  fuel,
  healthRows,
  loading,
  errorMessage,
}: Props) {
  if (errorMessage && !overview) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {errorMessage}
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md border border-border/50 bg-muted/30" />
        ))}
      </div>
    );
  }

  if (!overview) return null;

  const cards = [
    {
      label: 'Utilization',
      value: `${Math.round(overview.utilizationPct)}%`,
      hint: `${overview.movingHours}h moving`,
    },
    {
      label: 'Moving',
      value: String(overview.fleet.moving),
      hint: `of ${overview.fleet.totalVehicles} units`,
    },
    {
      label: 'Idle',
      value: String(overview.fleet.idling),
      hint: `${overview.idleHours}h idle`,
    },
    {
      label: 'Offline',
      value: String(overview.fleet.offline),
      hint: `${overview.openAlerts} open alerts`,
    },
    {
      label: 'Fuel',
      value:
        fuel != null
          ? `${fuel.fleetLitersPer100Km.toFixed(1)} L/100`
          : '—',
      hint:
        fuel != null
          ? `${Math.round(fuel.totalEstimatedFuelLiters)} L est.`
          : 'No fuel data',
    },
    {
      label: 'Health',
      value:
        healthRows != null
          ? String(
              healthRows.filter(
                (r) => r.checkEngineOn === true || (r.openHealthAlerts ?? 0) > 0,
              ).length,
            )
          : String(overview.openAlerts),
      hint:
        healthRows != null
          ? `${healthRows.length} units checked`
          : `${overview.openAlerts} open alerts`,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6"
      data-testid="fleet-analytics-strip"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            'rounded-md border border-border/60 bg-muted/15 px-2.5 py-2',
            'min-w-0',
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {card.label}
          </p>
          <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-foreground">
            {card.value}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
