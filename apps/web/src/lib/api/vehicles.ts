import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { vehicleKeys } from './query-keys';

export type VehicleStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';

export interface Vehicle {
  id: string;
  organizationId: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
  capacityKg: string | null;
  capacityM3: string | null;
  status: VehicleStatus;
  make: string | null;
  model: string | null;
  year: number | null;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleInput {
  vehicleCode?: string;
  plateNumber: string;
  type: string;
  capacityKg?: number;
  capacityM3?: number;
  make?: string;
  model?: string;
  year?: number;
  insuranceExpiry?: string;
  inspectionExpiry?: string;
}

export interface UpdateVehicleInput {
  vehicleCode?: string;
  plateNumber?: string;
  type?: string;
  capacityKg?: number;
  capacityM3?: number;
  status?: VehicleStatus;
  make?: string;
  model?: string;
  year?: number;
  insuranceExpiry?: string;
  inspectionExpiry?: string;
}

export interface ListVehiclesResponse {
  items: Vehicle[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListVehiclesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: VehicleStatus;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

class VehiclesAPI {
  async list(query: ListVehiclesParams = {}): Promise<ListVehiclesResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    if (query.search) params.append('search', query.search);
    if (query.status) params.append('status', query.status);
    if (query.includeArchived) params.append('includeArchived', String(query.includeArchived));
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.sortOrder) params.append('sortOrder', query.sortOrder);

    const response = await apiFetch(
      `/api/vehicles${params.size > 0 ? `?${params.toString()}` : ''}`,
      { method: 'GET' },
    );
    return unwrapResponse(response, 'Failed to fetch vehicles');
  }

  async getById(id: string): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch vehicle');
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const response = await apiFetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to create vehicle');
  }

  async update(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to update vehicle');
  }

  async archive(id: string): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}/archive`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to archive vehicle');
  }

  async restore(id: string): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}/restore`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to restore vehicle');
  }
}

export const vehiclesAPI = new VehiclesAPI();

function useInvalidateVehicles() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
}

export function useVehiclesList(query: ListVehiclesParams = {}, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: vehicleKeys.list(query),
    queryFn: () => vehiclesAPI.list(query),
    enabled: options.enabled ?? true,
  });

  return {
    data: result.data ?? null,
    items: result.data?.items ?? [],
    meta: result.data?.meta,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch vehicles') : null,
    refetch: result.refetch,
  };
}

export function useVehicle(id: string, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => vehiclesAPI.getById(id),
    enabled: (options.enabled ?? true) && Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch vehicle') : null,
    refetch: result.refetch,
  };
}

export function useCreateVehicle() {
  const invalidate = useInvalidateVehicles();
  const mutation = useMutation({
    mutationFn: (input: CreateVehicleInput) => vehiclesAPI.create(input),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create vehicle') : null,
  };
}

export function useUpdateVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  const mutation = useMutation({
    mutationFn: (input: UpdateVehicleInput) => vehiclesAPI.update(id, input),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update vehicle') : null,
  };
}

export function useArchiveVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  const mutation = useMutation({
    mutationFn: () => vehiclesAPI.archive(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to archive vehicle') : null,
  };
}

export function useRestoreVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  const mutation = useMutation({
    mutationFn: () => vehiclesAPI.restore(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to restore vehicle') : null,
  };
}
