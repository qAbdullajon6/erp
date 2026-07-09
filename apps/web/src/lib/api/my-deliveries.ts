import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type DriverOrderStatus = 'DRAFT' | 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

/// Only these are ever accepted by POST /orders/my/:id/status — the
/// backend rejects anything else with 403 (see OrdersService's
/// DRIVER_ALLOWED_STATUSES). ASSIGNED and CANCELLED are deliberately never
/// reachable from here: assignment happens through the dispatcher's
/// /orders/:id/assign, and cancellation is a dispatch decision.
export type DriverActionableStatus = 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED';

export interface MyDeliveryCustomer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string | null;
  deliveryNotes: string | null;
}

export interface MyDeliveryVehicle {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
}

export interface MyDeliveryStatusHistoryEntry {
  id: string;
  status: DriverOrderStatus;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface MyDelivery {
  id: string;
  orderNumber: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  cargoDescription: string;
  cargoWeightKg: string | null;
  cargoVolumeM3: string | null;
  price: string;
  currency: string;
  status: DriverOrderStatus;
  isDelayed: boolean;
  notes: string | null;
  deliveryNotes: string | null;
  deliveredAt: string | null;
  customer: MyDeliveryCustomer;
  vehicle: MyDeliveryVehicle | null;
  statusHistory?: MyDeliveryStatusHistoryEntry[];
}

export interface DriverProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  status: string;
  licenseNumber: string | null;
  licenseExpiry: string | null;
}

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || fallbackMessage);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class MyDeliveriesAPI {
  async getMyDriverProfile(): Promise<DriverProfile> {
    const response = await apiFetch('/api/drivers/me', { method: 'GET' });
    return unwrap(response, 'Failed to load your driver profile');
  }

  async list(status?: DriverOrderStatus): Promise<MyDelivery[]> {
    const qs = status ? `?status=${status}` : '';
    const response = await apiFetch(`/api/orders/my${qs}`, { method: 'GET' });
    return unwrap(response, 'Failed to load your deliveries');
  }

  async getById(id: string): Promise<MyDelivery> {
    const response = await apiFetch(`/api/orders/my/${id}`, { method: 'GET' });
    return unwrap(response, 'Failed to load delivery');
  }

  async updateStatus(id: string, status: DriverActionableStatus, note?: string): Promise<MyDelivery> {
    const response = await apiFetch(`/api/orders/my/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
    return unwrap(response, 'Failed to update delivery status');
  }
}

export const myDeliveriesAPI = new MyDeliveriesAPI();

export const myDeliveryKeys = {
  all: ['my-deliveries'] as const,
  profile: () => [...myDeliveryKeys.all, 'profile'] as const,
  lists: () => [...myDeliveryKeys.all, 'list'] as const,
  detail: (id: string) => [...myDeliveryKeys.all, 'detail', id] as const,
};

export function useMyDriverProfileQuery(enabled = true) {
  return useQuery({
    queryKey: myDeliveryKeys.profile(),
    queryFn: () => myDeliveriesAPI.getMyDriverProfile(),
    enabled,
    retry: false,
  });
}

export function useMyDeliveriesQuery(enabled = true) {
  return useQuery({
    queryKey: myDeliveryKeys.lists(),
    queryFn: () => myDeliveriesAPI.list(),
    enabled,
  });
}

export function useMyDeliveryQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: myDeliveryKeys.detail(id),
    queryFn: () => myDeliveriesAPI.getById(id),
    enabled: enabled && !!id,
  });
}

/// Invalidates my-deliveries list+detail so the driver's own view always
/// reflects the just-made change immediately. Note: the dispatcher-facing
/// Orders/Dispatch pages (`lib/api/orders.ts`, `dispatches.ts`) are NOT
/// react-query-based at all — they're hand-rolled useState hooks that
/// always refetch fresh on mount, with no shared cache to invalidate here.
/// A dispatcher viewing Orders in another session simply sees the new
/// status next time that page mounts/refetches, same as every other
/// cross-session update in this app (no websockets/shared cache anywhere).
export function useUpdateMyDeliveryStatusMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ status, note }: { status: DriverActionableStatus; note?: string }) =>
      myDeliveriesAPI.updateStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myDeliveryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: myDeliveryKeys.detail(id) });
    },
  });
}
