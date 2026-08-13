import { useQuery } from '@tanstack/react-query';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { describeError } from './describe-error';
import { dispatchAnalyticsKeys } from './query-keys';

export interface AnalyticsTrend {
  current: number;
  previous: number | null;
  percentChange: number | null;
}

export interface DispatchAnalyticsRange {
  from: string;
  to: string;
  comparisonFrom: string | null;
  comparisonTo: string | null;
}

export interface DispatchAnalyticsLive {
  activeDispatches: number;
  draftDispatches: number;
  delayedDispatches: number;
}

export interface DispatchAnalyticsPeriod {
  dispatchesCreated: AnalyticsTrend;
  completed: AnalyticsTrend;
  cancelled: AnalyticsTrend;
  /// Percent, 0-100, one decimal place.
  onTimeDeliveryRate: AnalyticsTrend;
  avgAssignmentMinutes: AnalyticsTrend;
  avgTripDurationMinutes: AnalyticsTrend;
}

export interface DispatchAnalyticsChartPoint {
  label: string;
  value: number;
}

export interface DispatchAnalyticsStatusPoint {
  status: string;
  count: number;
}

export interface DispatchAnalyticsWorkloadRow {
  id: string;
  label: string;
  count: number;
}

export interface DispatchAnalyticsDelayReason {
  reason: string;
  count: number;
}

export interface DispatchAnalyticsRouteRow {
  route: string;
  count: number;
}

export interface DispatchAnalyticsResponse {
  range: DispatchAnalyticsRange;
  live: DispatchAnalyticsLive;
  period: DispatchAnalyticsPeriod;
  dispatchesByDay: { granularity: 'day' | 'month'; points: DispatchAnalyticsChartPoint[] };
  dispatchesByStatus: DispatchAnalyticsStatusPoint[];
  driverWorkload: DispatchAnalyticsWorkloadRow[];
  vehicleUtilization: DispatchAnalyticsWorkloadRow[];
  delayReasons: DispatchAnalyticsDelayReason[];
  topDelayedRoutes: DispatchAnalyticsRouteRow[];
}

export interface DispatchAnalyticsQuery {
  dateFrom?: string;
  dateTo?: string;
  comparisonPeriod?: 'previous_period' | 'previous_year' | 'none';
}

class DispatchAnalyticsAPI {
  async get(query: DispatchAnalyticsQuery): Promise<DispatchAnalyticsResponse> {
    const params = new URLSearchParams();
    if (query.dateFrom) params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params.set('dateTo', query.dateTo);
    if (query.comparisonPeriod) params.set('comparisonPeriod', query.comparisonPeriod);
    const response = await apiFetch(
      `/api/dispatch/analytics${params.size > 0 ? `?${params.toString()}` : ''}`,
      { method: 'GET' },
    );
    return unwrapResponse(response, 'Failed to load dispatch analytics');
  }
}

export const dispatchAnalyticsAPI = new DispatchAnalyticsAPI();

/// Real backend aggregation (date-range scoped KPIs/trends/charts computed
/// over the organization's full matching data — see DispatchAnalyticsService
/// on the API). Replaces the previous client-side approximation over a
/// 200-dispatch slice.
export function useDispatchAnalyticsSnapshot(query: DispatchAnalyticsQuery, enabled = true) {
  const result = useQuery({
    queryKey: dispatchAnalyticsKeys.snapshot(query),
    queryFn: () => dispatchAnalyticsAPI.get(query),
    enabled,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    isFetching: result.isFetching,
    error: result.error ? describeError(result.error, 'Failed to load dispatch analytics') : null,
    dataUpdatedAt: result.dataUpdatedAt,
    refetch: result.refetch,
  };
}
