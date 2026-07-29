'use client';

import { formatDistanceToNow } from 'date-fns';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/list-states';
import { DispatchAnalyticsKpis } from '@/components/dispatch/analytics/dispatch-analytics-kpis';
import { DispatchAnalyticsCharts } from '@/components/dispatch/analytics/dispatch-analytics-charts';
import { DispatchAnalyticsWidgets } from '@/components/dispatch/analytics/dispatch-analytics-widgets';
import { DispatchAnalyticsInsights } from '@/components/dispatch/analytics/dispatch-analytics-insights';
import { useDispatchAnalytics } from '@/lib/hooks/use-dispatch-analytics';
import { cn } from '@/lib/utils';

export function DispatchAnalyticsDashboard() {
  const { snapshot, loading, isFetching, error, refetch, dataUpdatedAt } = useDispatchAnalytics();

  if (error && !snapshot) {
    return <ErrorState message={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6" data-testid="dispatch-analytics-dashboard">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand" aria-hidden="true" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Dispatch Analytics
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Operations KPIs, fleet utilization, and conflict-aware recommendations.
          </p>
          {dataUpdatedAt > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="analytics-refresh"
        >
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Refresh
        </Button>
      </header>

      <DispatchAnalyticsKpis kpis={snapshot?.kpis ?? null} loading={loading} />

      <DispatchAnalyticsCharts snapshot={snapshot} loading={loading} />

      <DispatchAnalyticsWidgets snapshot={snapshot} loading={loading} />

      <DispatchAnalyticsInsights insights={snapshot?.insights ?? []} loading={loading} />

      {error && snapshot ? (
        <p className={cn('text-xs text-warning')} role="status">
          Partial data — {error}
        </p>
      ) : null}
    </div>
  );
}
