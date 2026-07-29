'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildDispatchAnalytics } from '@/lib/dispatch/dispatch-analytics.builder';
import type { DispatchAnalyticsSnapshot } from '@/lib/dispatch/dispatch-analytics.types';
import { dispatchConflictsAPI } from '@/lib/api/dispatch-conflicts';
import { dispatchAnalyticsKeys } from '@/lib/api/query-keys';
import { describeError } from '@/lib/api/describe-error';
import { useDispatches, useDispatchBoardSummary } from '@/lib/hooks/use-dispatches';

const ANALYTICS_LIMIT = 200;
const REFETCH_MS = 60_000;

export function useDispatchAnalytics(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;

  const dispatchesQuery = useDispatches(
    1,
    ANALYTICS_LIMIT,
    {
      sortBy: 'pickupDateScheduled',
      sortOrder: 'desc',
    },
    { enabled, refetchInterval: REFETCH_MS },
  );

  const boardQuery = useDispatchBoardSummary({
    enabled,
    refetchInterval: REFETCH_MS,
  });

  const dispatchIds = useMemo(
    () => (dispatchesQuery.data ?? []).map((d) => d.id).slice(0, 200),
    [dispatchesQuery.data],
  );

  const conflictsQuery = useQuery({
    queryKey: dispatchAnalyticsKeys.snapshot({
      conflictsFor: dispatchIds.length,
      ids: dispatchIds,
    }),
    queryFn: () => dispatchConflictsAPI.batch(dispatchIds),
    enabled: enabled && dispatchIds.length > 0,
    staleTime: 30_000,
  });

  const snapshot: DispatchAnalyticsSnapshot | null = useMemo(() => {
    if (!dispatchesQuery.data) return null;
    return buildDispatchAnalytics({
      dispatches: dispatchesQuery.data,
      board: boardQuery.data,
      conflictsByDispatchId: conflictsQuery.data ?? {},
    });
  }, [dispatchesQuery.data, boardQuery.data, conflictsQuery.data]);

  /// Wait for dispatches + board first paint; conflicts may arrive a beat later
  /// and must recompute the same snapshot (KPI + widgets + insights share it).
  const loading =
    dispatchesQuery.loading ||
    boardQuery.loading ||
    (dispatchIds.length > 0 && conflictsQuery.isPending && !conflictsQuery.data);
  const isFetching =
    dispatchesQuery.refreshing || boardQuery.isFetching || conflictsQuery.isFetching;

  const error =
    dispatchesQuery.error ??
    boardQuery.error ??
    (conflictsQuery.error
      ? describeError(conflictsQuery.error, 'Failed to load conflict analytics')
      : null);

  return {
    snapshot,
    loading,
    isFetching,
    error,
    refetch: () => {
      void dispatchesQuery.refetch();
      void boardQuery.refetch();
      void conflictsQuery.refetch();
    },
    dataUpdatedAt: Math.max(
      dispatchesQuery.dataUpdatedAt ?? 0,
      boardQuery.dataUpdatedAt ?? 0,
      conflictsQuery.dataUpdatedAt ?? 0,
    ),
  };
}
