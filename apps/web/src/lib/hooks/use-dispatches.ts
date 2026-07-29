'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  CreateDispatchRequest,
  UpdateDispatchRequest,
  UpdateDispatchStatusRequest,
} from '@/lib/api/dispatches';
import { dispatchesAPI } from '@/lib/api/dispatches';
import { dashboardAPI } from '@/lib/api/dashboard';
import { describeError } from '@/lib/api/describe-error';
import { useInvalidateOperationalState } from '@/lib/api/invalidate';
import { dispatchBoardKeys, dispatchKeys } from '@/lib/api/query-keys';

/// Dispatch hooks — React Query (Task 8.9).
///
/// Every mutation here changes THE operational fact (ADR-001), so every one of them
/// invalidates the same three roots through the shared helper: dispatches, orders
/// (the projection of the dispatch), and availability (who is now free). None of
/// them refetches a sibling screen by hand.

export function useDispatches(
  page = 1,
  limit = 10,
  params?: {
    search?: string;
    status?: string;
    statuses?: string[];
    orderId?: string;
    driverId?: string;
    vehicleId?: string;
    customerId?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: 'createdAt' | 'pickupDateScheduled' | 'deliveryDateScheduled' | 'status';
    sortOrder?: 'asc' | 'desc';
  },
  options: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const result = useQuery({
    queryKey: dispatchKeys.list({ page, limit, ...(params ?? {}) }),
    queryFn: () => dispatchesAPI.list(page, limit, params),
    enabled: options.enabled ?? true,
    /// Opt-in: the Dispatch Board keeps the shift live the same way Overview does.
    /// Paused while the tab is hidden.
    refetchInterval: options.refetchInterval,
  });

  return {
    data: result.data?.items,
    meta: result.data?.meta,
    loading: result.isPending,
    /// True while a REFETCH is in flight over data we already have — after a
    /// mutation invalidated the board, say. Distinct from `loading`, which means
    /// "there is nothing to show yet": a board that blanked out to a spinner every
    /// time a card moved would be unusable, so the caller shows a quiet indicator
    /// instead and leaves the cards on screen.
    refreshing: result.isFetching && !result.isPending,
    dataUpdatedAt: result.dataUpdatedAt,
    error: result.error ? describeError(result.error, 'Failed to fetch dispatches') : null,
    refetch: result.refetch,
  };
}

/// The Operations Center's alert data: unassigned orders, and who's free/busy
/// (Task: dispatch board summary). A single global snapshot — no params, no
/// pagination — so its key carries no arguments. Also the Dashboard's "Live
/// Dispatch"/"Fleet Status" widgets (Task: Dashboard vertical audit) — same
/// cache entry as the Dispatch Board page, `enabled` gated for roles
/// (SALES_CRM_MANAGER) the endpoint 403s for, so the dashboard doesn't fire
/// a request guaranteed to fail.
export function useDispatchBoardSummary(
  options: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const result = useQuery({
    queryKey: dispatchBoardKeys.all,
    queryFn: () => dashboardAPI.getDispatchBoard(),
    enabled: options.enabled ?? true,
    /// Off by default (Dispatch Board drives its own refetching via mutations);
    /// the Command Center opts in so its live fleet/dispatch widgets stay fresh
    /// while it sits open all shift. Paused automatically while the tab is hidden.
    refetchInterval: options.refetchInterval,
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    isFetching: result.isFetching,
    dataUpdatedAt: result.dataUpdatedAt,
    error: result.error ? describeError(result.error, 'Failed to load board summary') : null,
    refetch: result.refetch,
  };
}

export function useDispatchDetail(id: string) {
  const result = useQuery({
    queryKey: dispatchKeys.detail(id),
    queryFn: () => dispatchesAPI.getById(id),
    enabled: Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch dispatch') : null,
    refetch: result.refetch,
  };
}

export function useCreateDispatch() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (data: CreateDispatchRequest) => dispatchesAPI.create(data),
    onSuccess: invalidate,
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create dispatch') : null,
  };
}

/// PATCH /dispatches/:id. Since Task 8.7 this also carries REASSIGNMENT (a new
/// driver and/or vehicle), which closes the open DispatchAssignment and opens a new
/// one — releasing one pair of resources and committing another. Availability is
/// wrong the instant it returns, which is why it invalidates like every other
/// operational write.
export function useUpdateDispatch(id: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (data: UpdateDispatchRequest) => dispatchesAPI.update(id, data),
    onSuccess: invalidate,
  });

  return {
    update: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update dispatch') : null,
  };
}

export function useUpdateDispatchStatus(id: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (data: UpdateDispatchStatusRequest) => dispatchesAPI.updateStatus(id, data),
    onSuccess: invalidate,
  });

  return {
    updateStatus: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update dispatch status') : null,
  };
}

export function useCancelDispatch(id: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: () => dispatchesAPI.cancel(id),
    onSuccess: invalidate,
  });

  return {
    cancel: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to cancel dispatch') : null,
  };
}
