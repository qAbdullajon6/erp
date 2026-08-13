'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildDispatchAnalyticsInsights } from '@/lib/dispatch/dispatch-analytics.builder';
import type { DispatchAnalyticsInsightsSnapshot } from '@/lib/dispatch/dispatch-analytics.types';
import { dispatchConflictsAPI, dispatchConflictKeys } from '@/lib/api/dispatch-conflicts';
import { describeError } from '@/lib/api/describe-error';
import { useDispatches, useDispatchBoardSummary } from '@/lib/hooks/use-dispatches';
import { useDispatchAnalyticsSnapshot, type DispatchAnalyticsQuery } from '@/lib/api/dispatch-analytics';

const REFETCH_MS = 60_000;
/// Every non-terminal status — the working set the insights half of the
/// dashboard (overload, conflicts, maintenance, unassigned) needs to see in
/// full. Bounded by fleet capacity in practice, not by total dispatch history.
const OPEN_STATUSES = ['DRAFT', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];
/// ListDispatchesQueryDto caps `limit` at 200 server-side — this must never
/// exceed that or the request 400s.
const OPEN_DISPATCH_LIMIT = 200;

export function useDispatchAnalytics(query: DispatchAnalyticsQuery, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;

  // Real backend aggregation: date-range KPIs, trends, and charts.
  const analytics = useDispatchAnalyticsSnapshot(query, enabled);

  // Client-side half: board-and-conflict-derived operational recommendations
  // that describe right now, not a historical bucket (see dispatch-analytics.types.ts).
  const openDispatchesQuery = useDispatches(
    1,
    OPEN_DISPATCH_LIMIT,
    { statuses: OPEN_STATUSES },
    { enabled, refetchInterval: REFETCH_MS },
  );
  const boardQuery = useDispatchBoardSummary({ enabled, refetchInterval: REFETCH_MS });

  const openDispatchIds = useMemo(
    () => (openDispatchesQuery.data ?? []).map((d) => d.id),
    [openDispatchesQuery.data],
  );

  const conflictsQuery = useQuery({
    queryKey: dispatchConflictKeys.batch(openDispatchIds),
    queryFn: () => dispatchConflictsAPI.batch(openDispatchIds),
    enabled: enabled && openDispatchIds.length > 0,
    staleTime: 30_000,
  });

  const insights: DispatchAnalyticsInsightsSnapshot | null = useMemo(() => {
    if (!openDispatchesQuery.data || !analytics.data) return null;
    return buildDispatchAnalyticsInsights({
      activeDispatches: openDispatchesQuery.data,
      board: boardQuery.data,
      conflictsByDispatchId: conflictsQuery.data ?? {},
      topDelayedRoutes: analytics.data.topDelayedRoutes,
    });
  }, [openDispatchesQuery.data, boardQuery.data, conflictsQuery.data, analytics.data]);

  const loading =
    analytics.loading ||
    openDispatchesQuery.loading ||
    boardQuery.loading ||
    (openDispatchIds.length > 0 && conflictsQuery.isPending && !conflictsQuery.data);
  const isFetching =
    analytics.isFetching || openDispatchesQuery.refreshing || boardQuery.isFetching || conflictsQuery.isFetching;

  const error =
    analytics.error ??
    openDispatchesQuery.error ??
    boardQuery.error ??
    (conflictsQuery.error ? describeError(conflictsQuery.error, 'Failed to load conflict analytics') : null);

  return {
    data: analytics.data,
    insights,
    board: boardQuery.data,
    loading,
    isFetching,
    error,
    /// The 200-cap this used to have is gone — `analytics.data` is a real
    /// backend aggregate over the whole date range. What's left bounded is
    /// the OPEN_DISPATCH_LIMIT safety net on the insights half, which is a
    /// generous cap on concurrently-open work, not on historical data.
    openDispatchesTruncated: (openDispatchesQuery.meta?.total ?? 0) > OPEN_DISPATCH_LIMIT,
    refetch: () => {
      void analytics.refetch();
      void openDispatchesQuery.refetch();
      void boardQuery.refetch();
      void conflictsQuery.refetch();
    },
    dataUpdatedAt: Math.max(
      analytics.dataUpdatedAt ?? 0,
      openDispatchesQuery.dataUpdatedAt ?? 0,
      boardQuery.dataUpdatedAt ?? 0,
      conflictsQuery.dataUpdatedAt ?? 0,
    ),
  };
}
