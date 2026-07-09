import { apiFetch } from './fetch';

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
  status: "DRAFT" | "ASSIGNED" | "EN_ROUTE_TO_PICKUP" | "AT_PICKUP" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
  pickupDateScheduled: string;
  pickupDateActual: string | null;
  deliveryDateScheduled: string;
  deliveryDateActual: string | null;
  notes?: string;
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
    return response.json();
  }

  async getById(id: string): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}`, { method: 'GET' });
    return response.json();
  }

  async create(data: CreateDispatchRequest): Promise<ApiDispatch> {
    const response = await apiFetch('/api/dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async update(id: string, data: UpdateDispatchRequest): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async updateStatus(id: string, data: UpdateDispatchStatusRequest): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async cancel(id: string): Promise<ApiDispatch> {
    const response = await apiFetch(`/api/dispatches/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return response.json();
  }
}

export const dispatchesAPI = new DispatchesAPI();
