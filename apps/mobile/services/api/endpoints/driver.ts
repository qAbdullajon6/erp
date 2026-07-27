import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { unwrapResponse } from '../error';
import { driverKeys, myDispatchKeys } from '../query-keys';

/// The driver's API. Mirrors apps/web/src/lib/api/my-deliveries.ts field-for-field —
/// same backend resource (GET/POST /dispatches/my/*, GET /drivers/me), same DRIVER
/// role guard (apps/api/src/dispatch/driver/driver-dispatch.controller.ts). A
/// dispatch is the operational record (ADR-001); Order.driverId is a read-only
/// projection of it, which is why this reads dispatches and not orders.

export type DispatchStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

/** What a driver may set. Never ASSIGNED (committing a driver to a job is the
 * dispatcher's call) and never CANCELLED (an operational decision above them).
 * Enforced server-side (DRIVER_DISPATCH_STATUSES); this type only stops the app
 * from offering a button for something the server would refuse. */
export type DriverActionableStatus = 'EN_ROUTE_TO_PICKUP' | 'AT_PICKUP' | 'IN_TRANSIT' | 'DELIVERED';

export interface MyDispatchCustomer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string | null;
  deliveryNotes: string | null;
}

export interface MyDispatchVehicle {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
}

export interface MyDispatchOrder {
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

export interface MyDispatchStatusHistoryEntry {
  id: string;
  status: DispatchStatus;
  note: string | null;
  createdAt: string;
}

/** A dispatch, as the driver sees it. */
export interface MyDispatch {
  id: string;
  dispatchNumber: string;
  status: DispatchStatus;
  /** Already narrowed by the server to what a DRIVER may do from here — the phone
   * renders one button per entry and decides nothing about legality itself. */
  allowedTransitions: DriverActionableStatus[];
  pickupDateScheduled: string;
  pickupDateActual: string | null;
  deliveryDateScheduled: string;
  deliveryDateActual: string | null;
  notes: string | null;
  order: MyDispatchOrder;
  customer: MyDispatchCustomer;
  vehicle: MyDispatchVehicle;
  statusHistory?: MyDispatchStatusHistoryEntry[];
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

class DriverAPI {
  async getMyProfile(): Promise<DriverProfile> {
    const response = await apiFetch('/drivers/me', { method: 'GET' });
    return unwrapResponse(response, 'Failed to load your driver profile');
  }

  async listMine(includeFinished = false): Promise<MyDispatch[]> {
    const qs = includeFinished ? '?includeFinished=true' : '';
    const response = await apiFetch(`/dispatches/my${qs}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load your deliveries');
  }

  async getMineById(id: string): Promise<MyDispatch> {
    const response = await apiFetch(`/dispatches/my/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load delivery');
  }

  async updateStatus(id: string, status: DriverActionableStatus, note?: string): Promise<MyDispatch> {
    const response = await apiFetch(`/dispatches/my/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
    return unwrapResponse(response, 'Failed to update delivery status');
  }
}

export const driverAPI = new DriverAPI();

export function useMyDriverProfileQuery(enabled = true) {
  return useQuery({
    queryKey: driverKeys.profile,
    queryFn: () => driverAPI.getMyProfile(),
    enabled,
    retry: false,
  });
}

export function useMyDispatchesQuery(includeFinished = false, enabled = true) {
  return useQuery({
    queryKey: [...myDispatchKeys.lists(), { includeFinished }],
    queryFn: () => driverAPI.listMine(includeFinished),
    enabled,
  });
}

export function useMyDispatchQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: myDispatchKeys.detail(id),
    queryFn: () => driverAPI.getMineById(id),
    enabled: enabled && Boolean(id),
  });
}

/** A driver moving a dispatch changes what the whole org sees as "who is free" and
 * "what's the order status" — but this app has no board/roster screen of its own to
 * keep in sync, so (unlike the web dispatcher's cross-cutting
 * useInvalidateOperationalState) invalidating this app's own two dispatch queries is
 * the complete, correct picture here. */
export function useUpdateMyDispatchStatusMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ status, note }: { status: DriverActionableStatus; note?: string }) =>
      driverAPI.updateStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myDispatchKeys.all });
    },
  });
}
