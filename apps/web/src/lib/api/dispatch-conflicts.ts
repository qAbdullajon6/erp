import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';

export type ConflictSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ConflictType =
  | 'driver.assigned'
  | 'driver.unavailable'
  | 'driver.inactive'
  | 'driver.on_leave'
  | 'driver.license_expired'
  | 'vehicle.assigned'
  | 'vehicle.unavailable'
  | 'vehicle.inactive'
  | 'vehicle.maintenance'
  | 'vehicle.inspection_expired'
  | 'vehicle.insurance_expired'
  | 'schedule.pickup_overlap'
  | 'schedule.delivery_overlap'
  | 'schedule.dispatch_overlap'
  | 'schedule.late_pickup'
  | 'schedule.late_delivery'
  | 'schedule.travel_impossible'
  | 'capacity.weight'
  | 'capacity.volume'
  | 'business.dispatch_cancelled'
  | 'business.dispatch_completed'
  | 'business.order_closed'
  | 'business.customer_blocked'
  | 'business.credit_hold'
  | 'operational.utilization';

export type ConflictAction =
  | 'swap_driver'
  | 'swap_vehicle'
  | 'reschedule'
  | 'larger_vehicle'
  | 'contact_finance'
  | 'ignore'
  | 'recheck';

export interface ConflictRecommendation {
  action: ConflictAction;
  label: string;
  description?: string;
  payload?: Record<string, unknown>;
}

export interface DispatchConflict {
  id: string;
  type: ConflictType;
  category: string;
  severity: ConflictSeverity;
  message: string;
  description: string;
  recommendation: string;
  recommendations: ConflictRecommendation[];
  autoResolvable: boolean;
  ignored: boolean;
  resolved: boolean;
  detectedAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  details?: Record<string, unknown>;
}

export interface DispatchConflictSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unresolved: number;
}

export interface DispatchConflictsResponse {
  dispatchId: string;
  items: DispatchConflict[];
  summary: DispatchConflictSummary;
  checkedAt: string;
}

export interface CheckDispatchConflictsInput {
  driverId?: string;
  vehicleId?: string;
  pickupDateScheduled?: string;
  deliveryDateScheduled?: string;
  recordAudit?: boolean;
}

class DispatchConflictsAPI {
  async list(dispatchId: string): Promise<DispatchConflictsResponse> {
    const response = await apiFetch(`/api/dispatches/${dispatchId}/conflicts`);
    return unwrapResponse(response, 'Failed to load dispatch conflicts');
  }

  async check(
    dispatchId: string,
    input: CheckDispatchConflictsInput,
  ): Promise<DispatchConflictsResponse> {
    const response = await apiFetch(`/api/dispatches/${dispatchId}/check-conflicts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to check dispatch conflicts');
  }

  async batch(ids: string[]): Promise<Record<string, DispatchConflictsResponse>> {
    const response = await apiFetch('/api/dispatches/conflicts/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return unwrapResponse(response, 'Failed to load batch conflicts');
  }

  async ignore(dispatchId: string, conflictId: string): Promise<DispatchConflictsResponse> {
    const response = await apiFetch(
      `/api/dispatches/${dispatchId}/conflicts/${conflictId}/ignore`,
      { method: 'POST' },
    );
    return unwrapResponse(response, 'Failed to ignore conflict');
  }

  async resolve(dispatchId: string, conflictId: string): Promise<DispatchConflictsResponse> {
    const response = await apiFetch(
      `/api/dispatches/${dispatchId}/conflicts/${conflictId}/resolve`,
      { method: 'POST' },
    );
    return unwrapResponse(response, 'Failed to resolve conflict');
  }
}

export const dispatchConflictsAPI = new DispatchConflictsAPI();

export const dispatchConflictKeys = {
  all: ['dispatch-conflicts'] as const,
  detail: (dispatchId: string) => ['dispatch-conflicts', dispatchId] as const,
  batch: (ids: string[]) => ['dispatch-conflicts', 'batch', ...ids.sort()] as const,
};

export function useDispatchConflicts(dispatchId: string, enabled = true) {
  return useQuery({
    queryKey: dispatchConflictKeys.detail(dispatchId),
    queryFn: () => dispatchConflictsAPI.list(dispatchId),
    enabled: enabled && Boolean(dispatchId),
    staleTime: 30_000,
  });
}

export function useDispatchConflictsBatch(ids: string[], enabled = true) {
  const unique = [...new Set(ids)].filter(Boolean).slice(0, 200);
  return useQuery({
    queryKey: dispatchConflictKeys.batch(unique),
    queryFn: () => dispatchConflictsAPI.batch(unique),
    enabled: enabled && unique.length > 0,
    staleTime: 30_000,
  });
}

export function useCheckDispatchConflicts(dispatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckDispatchConflictsInput) =>
      dispatchConflictsAPI.check(dispatchId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(dispatchConflictKeys.detail(dispatchId), data);
      void queryClient.invalidateQueries({ queryKey: dispatchConflictKeys.all });
    },
  });
}

export function useIgnoreDispatchConflict(dispatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conflictId: string) => dispatchConflictsAPI.ignore(dispatchId, conflictId),
    onSuccess: (data) => {
      queryClient.setQueryData(dispatchConflictKeys.detail(dispatchId), data);
      void queryClient.invalidateQueries({ queryKey: dispatchConflictKeys.all });
    },
  });
}

export function useResolveDispatchConflict(dispatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conflictId: string) => dispatchConflictsAPI.resolve(dispatchId, conflictId),
    onSuccess: (data) => {
      queryClient.setQueryData(dispatchConflictKeys.detail(dispatchId), data);
      void queryClient.invalidateQueries({ queryKey: dispatchConflictKeys.all });
    },
  });
}

export function activeConflicts(data?: DispatchConflictsResponse | null): DispatchConflict[] {
  if (!data) return [];
  return data.items.filter((c) => !c.ignored && !c.resolved);
}

const SEVERITY_RANK: ConflictSeverity[] = ['critical', 'high', 'medium', 'low'];

export function highestActiveSeverity(
  data?: DispatchConflictsResponse | Pick<DispatchConflictSummary, 'critical' | 'high' | 'medium' | 'low'> | null,
): ConflictSeverity | null {
  if (!data) return null;

  if ('items' in data && data.items) {
    const active = activeConflicts(data);
    for (const severity of SEVERITY_RANK) {
      if (active.some((c) => c.severity === severity)) return severity;
    }
    return null;
  }

  const summary = data as Pick<DispatchConflictSummary, 'critical' | 'high' | 'medium' | 'low'>;
  if (summary.critical > 0) return 'critical';
  if (summary.high > 0) return 'high';
  if (summary.medium > 0) return 'medium';
  if (summary.low > 0) return 'low';
  return null;
}
