import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { driverKeys } from './query-keys';

export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export interface Driver {
  id: string;
  organizationId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  status: DriverStatus;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  /// Linked login account when an admin has attached a DRIVER-role user.
  userId?: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverInput {
  employeeCode?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export interface UpdateDriverInput {
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  status?: DriverStatus;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export interface ListDriversResponse {
  items: Driver[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListDriversParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: DriverStatus;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

class DriversAPI {
  async list(query: ListDriversParams = {}): Promise<ListDriversResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    if (query.search) params.append('search', query.search);
    if (query.status) params.append('status', query.status);
    if (query.includeArchived) params.append('includeArchived', String(query.includeArchived));
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.sortOrder) params.append('sortOrder', query.sortOrder);

    const response = await apiFetch(
      `/api/drivers${params.size > 0 ? `?${params.toString()}` : ''}`,
      { method: 'GET' },
    );
    return unwrapResponse(response, 'Failed to fetch drivers');
  }

  async getById(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch driver');
  }

  async create(input: CreateDriverInput): Promise<Driver> {
    const response = await apiFetch('/api/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to create driver');
  }

  async update(id: string, input: UpdateDriverInput): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to update driver');
  }

  async archive(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/archive`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to archive driver');
  }

  async restore(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/restore`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to restore driver');
  }

  async linkUser(id: string, userId: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/link-user`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return unwrapResponse(response, 'Failed to link driver login');
  }

  async unlinkUser(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/unlink-user`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to unlink driver login');
  }
}

export const driversAPI = new DriversAPI();

function useInvalidateDrivers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: driverKeys.all });
}

/// Hooks — React Query (same contract as Customers/Orders). Mutations
/// invalidate `driverKeys` so list, detail, and expense pickers share one cache.

export function useDriversList(query: ListDriversParams = {}, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: driverKeys.list(query),
    queryFn: () => driversAPI.list(query),
    enabled: options.enabled ?? true,
  });

  return {
    data: result.data ?? null,
    items: result.data?.items ?? [],
    meta: result.data?.meta,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch drivers') : null,
    refetch: result.refetch,
  };
}

export function useDriver(id: string, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: driverKeys.detail(id),
    queryFn: () => driversAPI.getById(id),
    enabled: (options.enabled ?? true) && Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch driver') : null,
    refetch: result.refetch,
  };
}

export function useCreateDriver() {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (input: CreateDriverInput) => driversAPI.create(input),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create driver') : null,
  };
}

export function useUpdateDriver(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (input: UpdateDriverInput) => driversAPI.update(id, input),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update driver') : null,
  };
}

export function useArchiveDriver(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.archive(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to archive driver') : null,
  };
}

export function useRestoreDriver(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.restore(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to restore driver') : null,
  };
}

export function useLinkDriverUser(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (userId: string) => driversAPI.linkUser(id, userId),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to link driver login') : null,
  };
}

export function useUnlinkDriverUser(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.unlinkUser(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to unlink driver login') : null,
  };
}
