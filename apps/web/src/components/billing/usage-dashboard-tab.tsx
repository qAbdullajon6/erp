import { Users, Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { ErrorState, EmptyState } from "@/components/shared/list-states";
import { UsageMeter } from "./usage-meter";
import { formatDate } from "@/lib/format";
import { useUsageQuery, useSeatsQuery } from "@/lib/api/billing";

export function UsageDashboardTab() {
  const usageQuery = useUsageQuery();
  const seatsQuery = useSeatsQuery();

  if (usageQuery.isLoading || seatsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (usageQuery.isError) {
    return <ErrorState message="Failed to load usage." onRetry={() => void usageQuery.refetch()} />;
  }

  const usage = usageQuery.data;
  const seats = seatsQuery.data;
  const metrics = usage?.metrics ?? [];

  if (metrics.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title="No usage to show"
        description="Usage appears here once this organization has an active subscription and starts consuming metered resources."
      />
    );
  }

  return (
    <div className="space-y-6">
      {seats ? (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-brand/10 p-2 text-brand">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Seats</p>
              <p className="text-sm text-muted-foreground">
                {seats.isUnlimited
                  ? `${seats.used} in use · Unlimited seats`
                  : `${seats.used} of ${seats.available} seats in use`}
              </p>
            </div>
          </div>
          {!seats.isUnlimited && seats.available !== null ? (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${Math.min(100, Math.max(1, seats.percentageUsed))}%` }}
              />
            </div>
          ) : null}
        </SurfaceCard>
      ) : null}

      <SurfaceCard className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-foreground">Quota usage</h3>
          {usage ? (
            <p className="text-xs text-muted-foreground">
              Billing period {formatDate(usage.periodStart)} – {formatDate(usage.periodEnd)}
            </p>
          ) : null}
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {metrics.map((metric) => (
            <UsageMeter key={metric.metricType} metric={metric} />
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
