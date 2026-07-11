import { useMutation, useQuery } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { useInvalidateOperationalState } from './invalidate';
import { driverDispatchKeys } from './query-keys';

/// The driver's API (Task 8.12).
///
/// A driver executes a DISPATCH. This file used to talk to `/orders/my/*`, and that
/// list was found by `Order.driverId` — but since Task 8.6 that column is a
/// projection, a copy of what the dispatch says. The driver was reading their own
/// work off a photocopy. It now reads the original: `/dispatches/my`.
///
/// What the driver gains by it: the dispatch number, the scheduled window, and the
/// ability to say EN_ROUTE_TO_PICKUP — a state that previously could not be recorded
/// when it happened, only backfilled with a false timestamp once they had already
/// arrived.

export type DispatchStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

/// What a driver may set. Never ASSIGNED (committing a driver to a job is the
/// dispatcher's call) and never CANCELLED (an operational decision above them).
/// Enforced server-side; this type only stops us writing nonsense.
export type DriverActionableStatus =
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED';

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

/// The commercial job the dispatch executes. Context for the driver, not the thing
/// they are working on — which is why it is nested.
export interface MyDeliveryOrder {
  id: string;
  orderNumber: string;
  pickupAddress: string;
  pickupCity: string;
  deliveryAddress: string;
  deliveryCity: string;
  cargoDescription: string;
  cargoWeightKg: string | null;
  deliveryNotes: string | null;
  status: string;
}

export interface MyDeliveryStatusHistoryEntry {
  id: string;
  status: DispatchStatus;
  note: string | null;
  createdAt: string;
}

/// A dispatch, as the driver sees it.
export interface MyDelivery {
  id: string;
  dispatchNumber: string;
  status: DispatchStatus;
  /// Already narrowed by the server to what a DRIVER may do from here (R13 + the
  /// driver-safe set). The phone renders a button per entry and decides nothing.
  allowedTransitions: DriverActionableStatus[];
  pickupDateScheduled: string;
  pickupDateActual: string | null;
  deliveryDateScheduled: string;
  deliveryDateActual: string | null;
  notes: string | null;
  order: MyDeliveryOrder;
  customer: MyDeliveryCustomer;
  vehicle: MyDeliveryVehicle;
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

class MyDeliveriesAPI {
  async getMyDriverProfile(): Promise<DriverProfile> {
    const response = await apiFetch('/api/drivers/me', { method: 'GET' });
    return unwrapResponse(response, 'Failed to load your driver profile');
  }

  async list(includeFinished = false): Promise<MyDelivery[]> {
    const qs = includeFinished ? '?includeFinished=true' : '';
    const response = await apiFetch(`/api/dispatches/my${qs}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load your deliveries');
  }

  async getById(id: string): Promise<MyDelivery> {
    const response = await apiFetch(`/api/dispatches/my/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load delivery');
  }

  async updateStatus(
    id: string,
    status: DriverActionableStatus,
    note?: string,
  ): Promise<MyDelivery> {
    const response = await apiFetch(`/api/dispatches/my/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
    return unwrapResponse(response, 'Failed to update delivery status');
  }
}

export const myDeliveriesAPI = new MyDeliveriesAPI();

/// Re-exported from the shared factory so there is exactly one spelling of these
/// keys (Task 8.9): a key written twice is two caches, and a mutation invalidates
/// only one of them.
export const myDeliveryKeys = driverDispatchKeys;

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
    enabled: enabled && Boolean(id),
  });
}

/// A driver moving a dispatch is the SAME operational fact a dispatcher moving one
/// is: the dispatch changes, the order projection follows, and who is free changes.
/// So it invalidates through the one shared helper (Task 8.9), plus the driver's own
/// two queries — which the helper knows nothing about, because they are a different
/// view of the same data under a different key.
export function useUpdateMyDeliveryStatusMutation(id: string) {
  const invalidateOperational = useInvalidateOperationalState();

  return useMutation({
    mutationFn: ({ status, note }: { status: DriverActionableStatus; note?: string }) =>
      myDeliveriesAPI.updateStatus(id, status, note),
    onSuccess: invalidateOperational,
  });
}

export { describeError };
