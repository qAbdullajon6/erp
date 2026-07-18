import { unwrapResponse } from './error';
import { apiFetch } from './fetch';

export type DispatchStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "EN_ROUTE_TO_PICKUP"
  | "AT_PICKUP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface ApiDispatch {
  id: string;
  organizationId: string;
  dispatchNumber: string;
  orderId: string;
  order?: {
    id: string;
    orderNumber: string;
    pickupCity?: string;
    deliveryCity?: string;
    customer?: {
      id: string;
      companyName: string;
      contactName: string;
    };
    status: string;
  };
  driverId: string;
  driver?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
  };
  vehicleId: string;
  vehicle?: {
    id: string;
    vehicleCode: string;
    plateNumber: string;
    type: string;
    status: string;
  };
  createdByUserId?: string;
  createdBy?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  status: DispatchStatus;
  /// Which statuses this dispatch may legally move to, straight from the server's
  /// own transition table (R13). The UI does not decide this and must never try:
  /// three separate frontend copies of that table used to exist, and every one of
  /// them was a chance to offer a button the API would refuse. Empty = terminal.
  allowedTransitions: DispatchStatus[];
  pickupDateScheduled: string;
  pickupDateActual: string | null;
  deliveryDateScheduled: string;
  deliveryDateActual: string | null;
  notes?: string;
  deliveryNotes?: string;
  deliveryProofCount?: number;
  statusHistory?: Array<{
    id: string;
    status: string;
    note?: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDispatchRequest {
  orderId: string;
  driverId: string;
  vehicleId: string;
  notes?: string;
}

export interface UpdateDispatchRequest {
  notes?: string;
  /// Reassignment (Task 8.7). Both optional and additive: a request carrying only
  /// `notes` behaves exactly as it always did. Supplying either re-runs
  /// AssignmentPolicy and, if the resource really changes, closes the dispatch's open
  /// DispatchAssignment and opens a new one (R9).
  driverId?: string;
  vehicleId?: string;
}

export interface UpdateDispatchStatusRequest {
  status: string;
  note?: string;
}

export interface ListDispatchesResponse {
  items: ApiDispatch[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class DispatchesAPI {
  async list(
    page = 1,
    limit = 10,
    params?: { search?: string; status?: string; orderId?: string; driverId?: string; vehicleId?: string },
  ): Promise<ListDispatchesResponse> {
    const query = new URLSearchParams();
    if (page) query.append('page', String(page));
    if (limit) query.append('limit', String(limit));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.orderId) query.append('orderId', params.orderId);
    if (params?.driverId) query.append('driverId', params.driverId);
    if (params?.vehicleId) query.append('vehicleId', params.vehicleId);

    const response = await apiFetch(
      `/api/dispatches${query.size > 0 ? `?${query.toString()}` : ''}`,
      { method: 'GET' }
    );
    return unwrapResponse(response, 'Failed to fetch dispatches');
  }

  async getById(id: string): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch dispatch');
  }

  async create(data: CreateDispatchRequest): Promise<ApiDispatch> {
    const response = await apiFetch('/api/dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to create dispatch');
  }

  async update(id: string, data: UpdateDispatchRequest): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to update dispatch');
  }

  async updateStatus(id: string, data: UpdateDispatchStatusRequest): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to update dispatch status');
  }

  async cancel(id: string): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return unwrapResponse(response, 'Failed to cancel dispatch');
  }
}

export const dispatchesAPI = new DispatchesAPI();
