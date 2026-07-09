import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type ExpenseCategory = 'FUEL' | 'TOLL' | 'MAINTENANCE' | 'DRIVER_ADVANCE' | 'PARKING' | 'INSURANCE' | 'OTHER';
export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Expense {
  id: string;
  organizationId: string;
  orderId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  currency: string;
  status: ExpenseStatus;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListExpensesResponse {
  items: Expense[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListExpensesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ExpenseStatus;
  category?: ExpenseCategory;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'expenseNumber' | 'expenseDate' | 'amount' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateExpenseInput {
  expenseNumber?: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  expenseDate?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency?: string;
  notes?: string;
}

export interface UpdateExpenseInput {
  expenseNumber?: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  expenseDate?: string;
  category?: ExpenseCategory;
  description?: string;
  amount?: number;
  currency?: string;
  notes?: string;
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || fallbackMessage);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class ExpensesAPI {
  async list(params: ListExpensesParams = {}): Promise<ListExpensesResponse> {
    const response = await apiFetch(`/api/expenses${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch expenses');
  }

  async getById(id: string): Promise<Expense> {
    const response = await apiFetch(`/api/expenses/${id}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch expense');
  }

  async create(input: CreateExpenseInput): Promise<Expense> {
    const response = await apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to create expense');
  }

  async update(id: string, input: UpdateExpenseInput): Promise<Expense> {
    const response = await apiFetch(`/api/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to update expense');
  }

  async approve(id: string): Promise<Expense> {
    const response = await apiFetch(`/api/expenses/${id}/approve`, { method: 'POST' });
    return unwrap(response, 'Failed to approve expense');
  }

  async reject(id: string, rejectionReason?: string): Promise<Expense> {
    const response = await apiFetch(`/api/expenses/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason }),
    });
    return unwrap(response, 'Failed to reject expense');
  }
}

export const expensesAPI = new ExpensesAPI();

export const expenseKeys = {
  all: ['expenses'] as const,
  lists: () => [...expenseKeys.all, 'list'] as const,
  list: (params: ListExpensesParams) => [...expenseKeys.lists(), params] as const,
  details: () => [...expenseKeys.all, 'detail'] as const,
  detail: (id: string) => [...expenseKeys.details(), id] as const,
};

export function useExpensesQuery(params: ListExpensesParams = {}) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: () => expensesAPI.list(params),
  });
}

export function useExpenseQuery(id: string) {
  return useQuery({
    queryKey: expenseKeys.detail(id),
    queryFn: () => expensesAPI.getById(id),
    enabled: !!id,
  });
}

export function useCreateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => expensesAPI.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}

export function useUpdateExpenseMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExpenseInput) => expensesAPI.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
    },
  });
}

export function useApproveExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesAPI.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}

export function useRejectExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason?: string }) =>
      expensesAPI.reject(id, rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}
