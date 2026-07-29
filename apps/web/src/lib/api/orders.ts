import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { useInvalidateOperationalState } from './invalidate';
import { orderKeys } from './query-keys';

export type OrderStatus = 'DRAFT' | 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface Order {
  id: string;
  organizationId: string;
  orderNumber: string;
  customerId: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string; // ISO date
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string; // ISO date
  cargoDescription: string;
  cargoWeightKg: string | null;
  cargoVolumeM3: string | null;
  price: string; // decimal as string
  currency: string;
  status: OrderStatus;
  /// Which statuses this order may legally move to, straight from the server's own
  /// transition table (TD-006). The UI does not decide this and must never try: two
  /// separate frontend copies of that table used to exist. Empty = terminal.
  allowedTransitions: OrderStatus[];
  isDelayed: boolean;
  driverId: string | null;
  vehicleId: string | null;
  notes: string | null;
  deliveryNotes: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  deliveredAt: string | null;
  archivedAt?: string | null;
  statusHistory?: OrderStatusHistoryEntry[];
  customer?: { id: string; companyName: string; phone: string | null };
  plannedDriver?: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
  plannedVehicle?: { id: string; plateNumber: string; vehicleCode: string } | null;
  activeDispatch?: { id: string; status: string; driverId: string; vehicleId: string } | null;
}

export interface OrderStatusHistoryEntry {
  id: string;
  status: OrderStatus;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface ListOrdersResponse {
  items: Order[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateOrderInput {
  customerId: string;
  orderNumber?: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  cargoDescription: string;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  price: number;
  currency?: string;
  notes?: string;
  deliveryNotes?: string;
  acknowledgeDuplicate?: boolean;
}

export interface UpdateOrderInput {
  orderNumber?: string;
  customerId?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupDate?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDate?: string;
  cargoDescription?: string;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  price?: number;
  currency?: string;
  notes?: string;
  deliveryNotes?: string;
}

export interface AssignOrderInput {
  driverId: string;
  vehicleId: string;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  note?: string;
}

export interface CancelOrderInput {
  note?: string;
}

export type OrderPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'NO_INVOICE';

export interface ListOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  statuses?: OrderStatus[];
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  dispatcherId?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  createdFrom?: string;
  createdTo?: string;
  priceMin?: number;
  priceMax?: number;
  paymentStatus?: OrderPaymentStatus;
  archivedOnly?: boolean;
  includeArchived?: boolean;
  sortBy?: 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface DuplicateCheckResult {
  possibleDuplicate: boolean;
  matches: Order[];
}

export type OrderDocumentKind = 'POD' | 'ATTACHMENT' | 'OTHER';

export interface OrderDocument {
  id: string;
  organizationId: string;
  orderId: string;
  kind: OrderDocumentKind;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  uploadedByUserId: string | null;
  createdAt: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface OrderNote {
  id: string;
  organizationId: string;
  orderId: string;
  body: string;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

class OrdersAPI {
  private baseUrl = '/api';

  async listOrders(query: ListOrdersQuery = {}): Promise<ListOrdersResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.search) params.append('search', query.search);
    if (query.status) params.append('status', query.status);
    if (query.statuses?.length) params.append('statuses', query.statuses.join(','));
    if (query.customerId) params.append('customerId', query.customerId);
    if (query.driverId) params.append('driverId', query.driverId);
    if (query.vehicleId) params.append('vehicleId', query.vehicleId);
    if (query.dispatcherId) params.append('dispatcherId', query.dispatcherId);
    if (query.pickupDateFrom) params.append('pickupDateFrom', query.pickupDateFrom);
    if (query.pickupDateTo) params.append('pickupDateTo', query.pickupDateTo);
    if (query.deliveryDateFrom) params.append('deliveryDateFrom', query.deliveryDateFrom);
    if (query.deliveryDateTo) params.append('deliveryDateTo', query.deliveryDateTo);
    if (query.createdFrom) params.append('createdFrom', query.createdFrom);
    if (query.createdTo) params.append('createdTo', query.createdTo);
    if (query.priceMin !== undefined) params.append('priceMin', String(query.priceMin));
    if (query.priceMax !== undefined) params.append('priceMax', String(query.priceMax));
    if (query.paymentStatus) params.append('paymentStatus', query.paymentStatus);
    if (query.archivedOnly) params.append('archivedOnly', 'true');
    if (query.includeArchived) params.append('includeArchived', 'true');
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.sortOrder) params.append('sortOrder', query.sortOrder);

    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}/orders?${queryString}` : `${this.baseUrl}/orders`;

    const response = await apiFetch(url, { method: 'GET' });

    return unwrapResponse(response, 'Failed to fetch orders');
  }

  async getOrder(id: string): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}`, { method: 'GET' });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch order: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to create order');
  }

  async updateOrder(id: string, input: UpdateOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to update order');
  }

  async assignOrder(id: string, input: AssignOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to assign order');
  }

  async updateOrderStatus(id: string, input: UpdateOrderStatusInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to update order status');
  }

  async cancelOrder(id: string, input: CancelOrderInput = {}): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to cancel order');
  }

  async archiveOrder(id: string): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/archive`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to archive order');
  }

  async restoreOrder(id: string): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/restore`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to restore order');
  }

  async checkDuplicate(input: CreateOrderInput): Promise<DuplicateCheckResult> {
    const response = await apiFetch(`${this.baseUrl}/orders/check-duplicate`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to check duplicate');
  }

  async listNotes(orderId: string): Promise<{ items: OrderNote[] }> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/notes`, { method: 'GET' });
    const data = await unwrapResponse<{ items: OrderNote[] } | OrderNote[]>(
      response,
      'Failed to fetch order notes',
    );
    if (Array.isArray(data)) return { items: data };
    return { items: Array.isArray(data?.items) ? data.items : [] };
  }

  async listDocuments(orderId: string): Promise<{ items: OrderDocument[] }> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/documents`, { method: 'GET' });
    const data = await unwrapResponse<{ items: OrderDocument[] } | OrderDocument[]>(
      response,
      'Failed to fetch order documents',
    );
    if (Array.isArray(data)) return { items: data };
    return { items: Array.isArray(data?.items) ? data.items : [] };
  }

  async uploadDocument(orderId: string, file: File, kind?: OrderDocumentKind): Promise<OrderDocument> {
    const formData = new FormData();
    formData.append('file', file);
    if (kind) formData.append('kind', kind);
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/documents`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload document');
  }

  async deleteDocument(orderId: string, documentId: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/documents/${documentId}`, {
      method: 'DELETE',
    });
    await unwrapResponse(response, 'Failed to delete document');
  }

  async renameDocument(orderId: string, documentId: string, fileName: string): Promise<OrderDocument> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fileName }),
    });
    return unwrapResponse(response, 'Failed to rename document');
  }

  /// Authenticated blob download — `<img src>` / bare `<a href>` cannot send JWT.
  async fetchDocumentBlob(orderId: string, documentId: string): Promise<Blob> {
    const response = await apiFetch(
      `${this.baseUrl}/orders/${orderId}/documents/${documentId}/file`,
      { method: 'GET' },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = body?.error?.message ?? body?.message ?? 'Failed to download document';
      throw new Error(Array.isArray(message) ? message[0] : message);
    }
    return response.blob();
  }

  getDocumentFileUrl(orderId: string, documentId: string): string {
    return `${this.baseUrl}/orders/${orderId}/documents/${documentId}/file`;
  }

  async createNote(orderId: string, body: string): Promise<OrderNote> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    return unwrapResponse(response, 'Failed to create note');
  }

  async updateNote(orderId: string, noteId: string, body: string): Promise<OrderNote> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
    return unwrapResponse(response, 'Failed to update note');
  }

  async deleteNote(orderId: string, noteId: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl}/orders/${orderId}/notes/${noteId}`, {
      method: 'DELETE',
    });
    await unwrapResponse(response, 'Failed to delete note');
  }
}

export const ordersAPI = new OrdersAPI();

/// Hooks — React Query (Task 8.9).
///
/// The return shapes below deliberately match what the manual hooks returned
/// (`data` / `loading` / `error` / `refetch`, and `assign` / `cancel` / ...), so the
/// screens did not have to be rewritten around a new API. What changed is
/// underneath: there is no hand-rolled fetch state any more, and — crucially — no
/// mutation calls `refetch()` on its neighbours. Server state is invalidated, and
/// React Query refetches whatever is actually on screen.

export function useOrdersList(query: ListOrdersQuery = {}, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: orderKeys.list(query),
    queryFn: () => ordersAPI.listOrders(query),
    enabled: options.enabled ?? true,
  });

  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load orders') : null,
    refetch: result.refetch,
  };
}

export function useOrder(id: string) {
  const result = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersAPI.getOrder(id),
    enabled: Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load order') : null,
    refetch: result.refetch,
  };
}

export function useCreateOrder() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (input: CreateOrderInput) => ordersAPI.createOrder(input),
    onSuccess: invalidate,
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create order') : null,
  };
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrderInput }) =>
      ordersAPI.updateOrder(id, input),
    onSuccess: async (_data, vars) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', vars.id] });
    },
  });

  return {
    update: (id: string, input: UpdateOrderInput) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update order') : null,
  };
}

export function useAssignOrder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignOrderInput }) =>
      ordersAPI.assignOrder(id, input),
    onSuccess: async (_data, vars) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', vars.id] });
    },
  });

  return {
    assign: (id: string, input: AssignOrderInput) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to assign order') : null,
  };
}

/// Assigning an order creates or reassigns a DISPATCH (ADR-001, Task 8.7), which
/// moves the order projection and takes a driver and a vehicle out of the pool. All
/// three views are invalidated by the shared helper — no screen refetches another.
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrderStatusInput }) =>
      ordersAPI.updateOrderStatus(id, input),
    onSuccess: async (_data, vars) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', vars.id] });
    },
  });

  return {
    updateStatus: (id: string, input: UpdateOrderStatusInput) =>
      mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update order status') : null,
  };
}

export function useCancelOrder() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelOrderInput }) =>
      ordersAPI.cancelOrder(id, input),
    onSuccess: invalidate,
  });

  return {
    cancel: (id: string, input: CancelOrderInput = {}) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to cancel order') : null,
  };
}

export function useArchiveOrder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (id: string) => ordersAPI.archiveOrder(id),
    onSuccess: async (_data, id) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', id] });
    },
  });

  return {
    archive: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to archive order') : null,
  };
}

export function useRestoreOrder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (id: string) => ordersAPI.restoreOrder(id),
    onSuccess: async (_data, id) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', id] });
    },
  });

  return {
    restore: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to restore order') : null,
  };
}

export function useCheckDuplicateOrder() {
  const mutation = useMutation({
    mutationFn: (input: CreateOrderInput) => ordersAPI.checkDuplicate(input),
  });

  return {
    check: mutation.mutateAsync,
    loading: mutation.isPending,
  };
}

export function useOrderDocuments(orderId: string) {
  const result = useQuery({
    queryKey: [...orderKeys.detail(orderId), 'documents'],
    queryFn: () => ordersAPI.listDocuments(orderId),
    enabled: Boolean(orderId),
  });

  return {
    data: result.data?.items ?? [],
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load documents') : null,
    refetch: result.refetch,
  };
}

export function useUploadOrderDocument(orderId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind?: OrderDocumentKind }) =>
      ordersAPI.uploadDocument(orderId, file, kind),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...orderKeys.detail(orderId), 'documents'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', orderId] });
    },
  });

  return {
    upload: (file: File, kind?: OrderDocumentKind) => mutation.mutateAsync({ file, kind }),
    loading: mutation.isPending,
  };
}

export function useDeleteOrderDocument(orderId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (documentId: string) => ordersAPI.deleteDocument(orderId, documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...orderKeys.detail(orderId), 'documents'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', orderId] });
    },
  });

  return {
    remove: mutation.mutateAsync,
    loading: mutation.isPending,
  };
}

export function useRenameOrderDocument(orderId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ documentId, fileName }: { documentId: string; fileName: string }) =>
      ordersAPI.renameDocument(orderId, documentId, fileName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...orderKeys.detail(orderId), 'documents'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', orderId] });
    },
  });

  return {
    rename: (documentId: string, fileName: string) => mutation.mutateAsync({ documentId, fileName }),
    loading: mutation.isPending,
  };
}

export function useOrderNotes(orderId: string) {
  const result = useQuery({
    queryKey: [...orderKeys.detail(orderId), 'notes'],
    queryFn: () => ordersAPI.listNotes(orderId),
    enabled: Boolean(orderId),
  });

  return {
    data: result.data?.items ?? [],
    loading: result.isPending,
    refetch: result.refetch,
  };
}

export function useCreateOrderNote(orderId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: string) => ordersAPI.createNote(orderId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...orderKeys.detail(orderId), 'notes'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', orderId] });
    },
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
  };
}

export function useUpdateOrderNote(orderId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      ordersAPI.updateNote(orderId, noteId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...orderKeys.detail(orderId), 'notes'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', orderId] });
    },
  });

  return {
    update: (noteId: string, body: string) => mutation.mutateAsync({ noteId, body }),
    loading: mutation.isPending,
  };
}

export function useDeleteOrderNote(orderId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (noteId: string) => ordersAPI.deleteNote(orderId, noteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...orderKeys.detail(orderId), 'notes'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs', 'order', orderId] });
    },
  });

  return {
    remove: mutation.mutateAsync,
    loading: mutation.isPending,
  };
}
