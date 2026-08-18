'use client';

import { useNavigate, useSearch } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/shared/list-states';
import { PageHeader } from '@/components/shared/page-header';
import { DispatchAnalyticsKpis } from '@/components/dispatch/analytics/dispatch-analytics-kpis';
import { DispatchAnalyticsCharts } from '@/components/dispatch/analytics/dispatch-analytics-charts';
import { DispatchAnalyticsWidgets } from '@/components/dispatch/analytics/dispatch-analytics-widgets';
import { DispatchAnalyticsInsights } from '@/components/dispatch/analytics/dispatch-analytics-insights';
import { DispatchAnalyticsDateRange } from '@/components/dispatch/analytics/dispatch-analytics-date-range';
import { useDispatchAnalytics } from '@/lib/hooks/use-dispatch-analytics';
import { resolvePreset, type DateRangePreset, type DateRangeValue } from '@/components/reports/report-date-range';
import type { DispatchAnalyticsResponse } from '@/lib/api/dispatch-analytics';
import type { DispatchAnalyticsInsightsSnapshot } from '@/lib/dispatch/dispatch-analytics.types';
import { toCsv, downloadCsv } from '@/lib/csv';
import { toExcelXml, downloadExcel } from '@/lib/excel';
import { cn } from '@/lib/utils';

interface ExportRow {
  section: string;
  label: string;
  value: string;
  [key: string]: string;
}

const EXPORT_COLUMNS: { key: keyof ExportRow; label: string }[] = [
  { key: 'section', label: 'Section' },
  { key: 'label', label: 'Metric' },
  { key: 'value', label: 'Value' },
];

/// Flattens everything on screen — live gauges, period KPIs with their real
/// trend, and every chart/widget table — into one exportable snapshot, the
/// same "export what's currently loaded" contract Orders/Dispatches offer.
function buildExportRows(data: DispatchAnalyticsResponse, insights: DispatchAnalyticsInsightsSnapshot): ExportRow[] {
  const rows: ExportRow[] = [];
  const push = (section: string, label: string, value: string | number) =>
    rows.push({ section, label, value: String(value) });
  const pushTrend = (section: string, label: string, trend: { current: number; percentChange: number | null }) =>
    push(section, label, trend.percentChange == null ? trend.current : `${trend.current} (${trend.percentChange > 0 ? '+' : ''}${Math.round(trend.percentChange)}% vs prior period)`);

  push('Live', 'Active dispatches', data.live.activeDispatches);
  push('Live', 'Draft dispatches', data.live.draftDispatches);
  push('Live', 'Delayed dispatches', data.live.delayedDispatches);
  push('Live', 'Current conflicts', insights.conflictSummary.total);

  pushTrend('This Period', 'Dispatches created', data.period.dispatchesCreated);
  pushTrend('This Period', 'Completed', data.period.completed);
  pushTrend('This Period', 'Cancelled', data.period.cancelled);
  pushTrend('This Period', 'On-time delivery rate (%)', data.period.onTimeDeliveryRate);
  pushTrend('This Period', 'Avg assignment minutes', data.period.avgAssignmentMinutes);
  pushTrend('This Period', 'Avg trip duration minutes', data.period.avgTripDurationMinutes);

  for (const row of data.dispatchesByStatus) push('Dispatches by Status', row.status, row.count);
  for (const row of data.driverWorkload) push('Driver Workload', row.label, row.count);
  for (const row of data.vehicleUtilization) push('Vehicle Utilization', row.label, row.count);
  for (const row of data.delayReasons) push('Delay Reasons', row.reason, row.count);
  for (const row of data.topDelayedRoutes) push('Top Delayed Routes', row.route, row.count);

  const { conflictSummary } = insights;
  push('Conflict Summary', 'Critical', conflictSummary.critical);
  push('Conflict Summary', 'High', conflictSummary.high);
  push('Conflict Summary', 'Medium', conflictSummary.medium);
  push('Conflict Summary', 'Low', conflictSummary.low);
  for (const row of conflictSummary.byType) push('Conflict Summary', row.type, row.count);

  return rows;
}

export function DispatchAnalyticsDashboard() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/app/dispatches/analytics' });

  // The URL is the source of truth (mirrors the calendar route) — a bare
  // /app/dispatches/analytics with no search params still means "last 30
  // days", it just isn't spelled out in the URL until the admin changes it.
  const range: DateRangeValue = search.preset
    ? search.preset === 'custom'
      ? { preset: 'custom', dateFrom: search.dateFrom ?? resolvePreset('custom').dateFrom, dateTo: search.dateTo ?? resolvePreset('custom').dateTo }
      : resolvePreset(search.preset)
    : resolvePreset('last_30_days');

  const { data, insights, board, loading, isFetching, error, refetch, dataUpdatedAt, openDispatchesTruncated } =
    useDispatchAnalytics({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      comparisonPeriod: 'previous_period',
    });

  const handlePresetChange = (preset: DateRangePreset) => {
    const next = preset === 'custom' ? { ...range, preset } : resolvePreset(preset);
    void navigate({
      to: '/app/dispatches/analytics',
      search: {
        preset: next.preset,
        ...(next.preset === 'custom' ? { dateFrom: next.dateFrom, dateTo: next.dateTo } : {}),
      },
      replace: true,
    });
  };
  const handleCustomChange = (dateFrom: string, dateTo: string) => {
    void navigate({
      to: '/app/dispatches/analytics',
      search: { preset: 'custom', dateFrom, dateTo },
      replace: true,
    });
  };

  if (error && !data) {
    return <ErrorState message={error} onRetry={() => refetch()} />;
  }

  const handleExportCsv = () => {
    if (!data || !insights) return;
    const rows = buildExportRows(data, insights);
    if (rows.length === 0) {
      toast.error('No data to export yet');
      return;
    }
    downloadCsv('dispatch-analytics-snapshot.csv', toCsv(rows, EXPORT_COLUMNS));
    toast.success('Exported analytics snapshot to CSV');
  };

  const handleExportExcel = () => {
    if (!data || !insights) return;
    const rows = buildExportRows(data, insights);
    if (rows.length === 0) {
      toast.error('No data to export yet');
      return;
    }
    downloadExcel(
      'dispatch-analytics-snapshot',
      toExcelXml(rows, EXPORT_COLUMNS, 'Dispatch Analytics'),
    );
    toast.success('Exported analytics snapshot to Excel');
  };

  return (
    <div className="space-y-6" data-testid="dispatch-analytics-dashboard">
      <PageHeader
        title="Dispatch Analytics"
        subtitle={
          <>
            Operations KPIs, fleet utilization, and conflict-aware recommendations.
            {dataUpdatedAt > 0 ? (
              <span className="mt-1 block text-[11px]">
                Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </span>
            ) : null}
          </>
        }
        action={
          <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" disabled={!data} data-testid="analytics-export">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>Export snapshot (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>Export snapshot (Excel)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
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
          </>
        }
      />

      <DispatchAnalyticsDateRange value={range} onPresetChange={handlePresetChange} onCustomChange={handleCustomChange} />

      {openDispatchesTruncated ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground"
          role="status"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          More open dispatches exist than the recommendations panel below can show at once — driver/vehicle
          attention flags may be incomplete. Period KPIs and charts above are unaffected; they're computed
          from the database directly, not this list.
        </div>
      ) : null}

      <DispatchAnalyticsKpis
        live={data?.live ?? null}
        period={data?.period ?? null}
        board={board ?? null}
        currentConflicts={insights?.conflictSummary.total ?? 0}
        loading={loading}
      />

      <DispatchAnalyticsCharts snapshot={data} loading={loading} />

      <DispatchAnalyticsWidgets
        topDelayedRoutes={data?.topDelayedRoutes ?? null}
        insights={insights}
        loading={loading}
      />

      <DispatchAnalyticsInsights insights={insights?.insights ?? []} loading={loading} />

      {error && data ? (
        <p className={cn('text-xs text-warning')} role="status">
          Partial data — {error}
        </p>
      ) : null}
    </div>
  );
}
