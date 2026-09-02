import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export type RouteStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type RouteStopStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED';

export interface OptimizationPreview {
  routeUpdatedAt: string;
  optimized: boolean;
  currentDistance: number;
  optimizedDistance: number;
  distanceSaved: number;
  currentSequence: Array<{ id: string; sequence: number }>;
  proposedSequence: Array<{ id: string; sequence: number }>;
  warnings: string[];
  changedStopIds: string[];
  eligibleCount: number;
  fixedCount: number;
  missingCoordCount: number;
}

export interface ApiRouteStop {
  id: string;
  sequence: number;
  orderId: string | null;
  dispatchId: string | null;
  label: string | null;
  address: string;
  city: string;
  lat: string | null;
  lng: string | null;
  plannedArrival: string | null;
  plannedDeparture: string | null;
  distanceFromPrevM: number | null;
  durationFromPrevSec: number | null;
  status: RouteStopStatus;
  optimizationLocked: boolean;
  notes: string | null;
  order: { id: string; orderNumber: string } | null;
  dispatch: {
    id: string;
    dispatchNumber: string;
    status: string;
    vehicleId: string | null;
    driverId: string | null;
    failureReason: string | null;
    failureNotes: string | null;
    failedAt: string | null;
    stops: Array<{
      id: string;
      stopIndex: number;
      stopType: 'PICKUP' | 'DELIVERY' | 'INTERMEDIATE';
      arrivedAt: string | null;
      completedAt: string | null;
      failedAt: string | null;
      failureReason: string | null;
      failureNotes: string | null;
    }>;
  } | null;
}

export interface ApiRoute {
  id: string;
  organizationId: string;
  routeNumber: string;
  status: RouteStatus;
  driverId: string | null;
  vehicleId: string | null;
  plannedDate: string;
  startTime: string | null;
  endTime: string | null;
  totalDistanceM: number | null;
  totalDurationSec: number | null;
  calculatedAt: string | null;
  calculationStatus: string | null;
  geometry: string | null;
  notes: string | null;
  createdByUserId: string | null;
  driver: { id: string; employeeCode: string; firstName: string; lastName: string; phone: string } | null;
  vehicle: { id: string; vehicleCode: string; plateNumber: string; type: string } | null;
  createdBy: { id: string; firstName: string; lastName: string; email: string } | null;
  stops: ApiRouteStop[];
  createdAt: string;
  updatedAt: string;
}

export interface ListRoutesResponse {
  items: ApiRoute[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateRouteRequest {
  plannedDate: string;
  driverId?: string;
  vehicleId?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface UpdateRouteRequest {
  plannedDate?: string;
  driverId?: string;
  vehicleId?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  status?: RouteStatus;
}

export interface AddRouteStopRequest {
  orderId?: string;
  dispatchId?: string;
  label?: string;
  address: string;
  city: string;
  lat?: string;
  lng?: string;
  plannedArrival?: string;
  plannedDeparture?: string;
  notes?: string;
}

class RoutesAPI {
  async list(params?: {
    page?: number;
    limit?: number;
    status?: RouteStatus;
    driverId?: string;
    vehicleId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ListRoutesResponse> {
    const q = new URLSearchParams();
    if (params?.page) q.append('page', String(params.page));
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.status) q.append('status', params.status);
    if (params?.driverId) q.append('driverId', params.driverId);
    if (params?.vehicleId) q.append('vehicleId', params.vehicleId);
    if (params?.fromDate) q.append('fromDate', params.fromDate);
    if (params?.toDate) q.append('toDate', params.toDate);
    const response = await apiFetch(`/api/routes${q.size > 0 ? `?${q}` : ''}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch routes');
  }

  async create(data: CreateRouteRequest): Promise<ApiRoute> {
    const response = await apiFetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to create route');
  }

  async getById(id: string): Promise<ApiRoute> {
    const response = await apiFetch(`/api/routes/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch route');
  }

  async update(id: string, data: UpdateRouteRequest): Promise<ApiRoute> {
    const response = await apiFetch(`/api/routes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to update route');
  }

  async addStop(routeId: string, data: AddRouteStopRequest): Promise<ApiRouteStop> {
    const response = await apiFetch(`/api/routes/${routeId}/stops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to add stop');
  }

  async removeStop(routeId: string, stopId: string): Promise<void> {
    const response = await apiFetch(`/api/routes/${routeId}/stops/${stopId}`, { method: 'DELETE' });
    if (!response.ok) await unwrapResponse(response, 'Failed to remove stop');
  }

  async reorderStops(routeId: string, stopIds: string[]): Promise<ApiRoute> {
    const response = await apiFetch(`/api/routes/${routeId}/stops/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopIds }),
    });
    return unwrapResponse(response, 'Failed to reorder stops');
  }

  async calculate(routeId: string): Promise<{ calculation: unknown; message: string; missingStopCount?: number }> {
    const response = await apiFetch(`/api/routes/${routeId}/calculate`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to calculate route');
  }

  async updateStop(routeId: string, stopId: string, data: { optimizationLocked?: boolean; dispatchId?: string | null }): Promise<ApiRouteStop> {
    const response = await apiFetch(`/api/routes/${routeId}/stops/${stopId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to update stop');
  }

  async previewOptimization(routeId: string): Promise<OptimizationPreview> {
    const response = await apiFetch(`/api/routes/${routeId}/optimize/preview`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to preview optimization');
  }

  async applyOptimization(routeId: string, routeUpdatedAt: string): Promise<{ route: ApiRoute; changedStopIds: string[] }> {
    const response = await apiFetch(`/api/routes/${routeId}/optimize/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeUpdatedAt }),
    });
    return unwrapResponse(response, 'Failed to apply optimization');
  }

  async delete(id: string): Promise<void> {
    const response = await apiFetch(`/api/routes/${id}`, { method: 'DELETE' });
    if (!response.ok) await unwrapResponse(response, 'Failed to delete route');
  }
}

export const routesAPI = new RoutesAPI();

// React-Query hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function routeKeys() {
  return {
    all: ['routes'] as const,
    list: (params?: object) => ['routes', 'list', params] as const,
    detail: (id: string) => ['routes', 'detail', id] as const,
  };
}

export function useRoutesList(params?: Parameters<RoutesAPI['list']>[0]) {
  const { data, ...rest } = useQuery({
    queryKey: routeKeys().list(params),
    queryFn: () => routesAPI.list(params),
  });
  return { data: data?.items ?? [], meta: data?.meta, ...rest };
}

export function useRoute(id: string, opts?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: routeKeys().detail(id),
    queryFn: () => routesAPI.getById(id),
    enabled: Boolean(id),
    refetchInterval: opts?.refetchInterval,
    refetchOnReconnect: true,
  });
}

export function useCreateRouteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRouteRequest) => routesAPI.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().all }),
  });
}

export function useUpdateRouteMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateRouteRequest) => routesAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: routeKeys().list() });
      qc.invalidateQueries({ queryKey: routeKeys().detail(id) });
    },
  });
}

export function useAddRouteStopMutation(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddRouteStopRequest) => routesAPI.addStop(routeId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().detail(routeId) }),
  });
}

export function useRemoveRouteStopMutation(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stopId: string) => routesAPI.removeStop(routeId, stopId),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().detail(routeId) }),
  });
}

export function useReorderRouteStopsMutation(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stopIds: string[]) => routesAPI.reorderStops(routeId, stopIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().detail(routeId) }),
  });
}

export function useCalculateRouteMutation(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => routesAPI.calculate(routeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().detail(routeId) }),
  });
}

export function useDeleteRouteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => routesAPI.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().all }),
  });
}

export function useUpdateRouteStopMutation(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stopId, data }: { stopId: string; data: { optimizationLocked?: boolean; dispatchId?: string | null } }) =>
      routesAPI.updateStop(routeId, stopId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().detail(routeId) }),
  });
}

export function useOptimizePreviewMutation(routeId: string) {
  return useMutation({
    mutationFn: () => routesAPI.previewOptimization(routeId),
  });
}

export function useOptimizeApplyMutation(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routeUpdatedAt: string) => routesAPI.applyOptimization(routeId, routeUpdatedAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: routeKeys().detail(routeId) }),
  });
}
