'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  CreateDispatchRequest,
  UpdateDispatchRequest,
  UpdateDispatchStatusRequest,
} from '@/lib/api/dispatches';
import { dispatchesAPI } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { useInvalidateOperationalState } from '@/lib/api/invalidate';
import { dispatchKeys } from '@/lib/api/query-keys';

/// Dispatch hooks — React Query (Task 8.9).
///
/// Every mutation here changes THE operational fact (ADR-001), so every one of them
/// invalidates the same three roots through the shared helper: dispatches, orders
/// (the projection of the dispatch), and availability (who is now free). None of
/// them refetches a sibling screen by hand.

export function useDispatches(
  page = 1,
  limit = 10,
  params?: { search?: string; status?: string; orderId?: string; driverId?: string; vehicleId?: string },
) {
  const result = useQuery({
    queryKey: dispatchKeys.list({ page, limit, ...(params ?? {}) }),
    queryFn: () => dispatchesAPI.list(page, limit, params),
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
    error: result.error ? describeError(result.error, 'Failed to fetch dispatches') : null,
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
