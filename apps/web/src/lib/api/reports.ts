import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type ComparisonPeriod = 'previous_period' | 'previous_year' | 'none';
export type ExportReportType = 'executive-overview' | 'operations' | 'financial';

export interface ReportFilterParams {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  pickupCity?: string;
  deliveryCity?: string;
  orderStatus?: string;
  invoiceStatus?: string;
  currency?: string;
  timezone?: string;
  comparisonPeriod?: ComparisonPeriod;
}

export interface ReportFiltersEcho {
  dateFrom: string;
  dateTo: string;
  comparisonPeriod: ComparisonPeriod;
  timezone: string;
}

export interface ComparisonPair {
  current: number;
  previous: number;
  changePercent: number | null;
}

export interface ExecutiveOverviewTotals {
  totalOrders: number;
  deliveredOrders: number;
  activeOrders: number;
  delayedOrders: number;
  totalRevenue: string;
  approvedExpenses: string;
  estimatedGrossProfit: string;
  totalInvoiced: string;
  totalCollected: string;
  outstandingReceivables: string;
  deliveryCompletionRate: number;
  onTimeDeliveryRate: number;
}

export interface ExecutiveOverviewComparison {
  totalOrders: ComparisonPair;
  deliveredOrders: ComparisonPair;
  totalRevenue: ComparisonPair;
  approvedExpenses: ComparisonPair;
  estimatedGrossProfit: ComparisonPair;
  totalInvoiced: ComparisonPair;
  totalCollected: ComparisonPair;
  deliveryCompletionRate: ComparisonPair;
  onTimeDeliveryRate: ComparisonPair;
}

export interface RevenueExpenseBucket {
  bucket: string;
  revenue: number;
  expenses: number;
}

export interface DeliveryPerformanceBucket {
  bucket: string;
  delivered: number;
  delayed: number;
}

export interface OrdersByStatusRow {
  status: string;
  count: number;
}

export interface TopCustomerRow {
  customerId: string;
  companyName: string;
  revenue: string;
  orderCount: number;
}

export interface TopRouteRow {
  pickupCity: string;
  deliveryCity: string;
  revenue: string;
  orderCount: number;
}

export interface ExecutiveOverviewReport {
  filters: ReportFiltersEcho;
  totals: ExecutiveOverviewTotals;
  comparison: ExecutiveOverviewComparison | null;
  revenueVsExpensesTimeSeries: RevenueExpenseBucket[];
  deliveryPerformanceTimeSeries: DeliveryPerformanceBucket[];
  ordersByStatus: OrdersByStatusRow[];
  topCustomers: TopCustomerRow[];
  topRoutes: TopRouteRow[];
}

export interface DriverPerformanceRow {
  driverId: string;
  employeeCode: string;
  name: string;
  totalOrders: number;
  deliveredOrders: number;
  onTimeRate: number;
  delayedOrders: number;
  revenue: string;
}

export interface VehiclePerformanceRow {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  totalOrders: number;
  deliveredOrders: number;
  revenue: string;
  approvedExpenses: string;
  estimatedGrossProfit: string;
}

export interface RoutePerformanceRow {
  pickupCity: string;
  deliveryCity: string;
  totalOrders: number;
  deliveredOrders: number;
  completionRate: number;
  revenue: string;
}

export interface OrderExceptionRow {
  orderId: string;
  orderNumber: string;
  customerId: string;
  status: string;
  pickupCity: string;
  deliveryCity: string;
  deliveryDate: string;
  price: string;
  currency: string;
  approvedExpenses?: string;
  estimatedGrossProfit?: string;
}

export interface OperationsExceptions {
  delayedOrders: OrderExceptionRow[];
  unassignedActiveOrders: OrderExceptionRow[];
  cancelledOrders: OrderExceptionRow[];
  negativeProfitOrders: OrderExceptionRow[];
  deliveredWithoutInvoice: OrderExceptionRow[];
}

export interface OperationsReport {
  filters: ReportFiltersEcho;
  driverPerformance: DriverPerformanceRow[];
  vehiclePerformance: VehiclePerformanceRow[];
  routePerformance: RoutePerformanceRow[];
  exceptions: OperationsExceptions;
}

export interface ReceivablesAgingBucket {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  amount: string;
  invoiceCount: number;
}

export interface InvoiceCollectionPerformance {
  invoiceCount: number;
  paidInvoiceCount: number;
  totalInvoiced: string;
  totalCollected: string;
  collectionRate: number;
  averageDaysToFullPayment: number | null;
}

export interface ExpenseBreakdownRow {
  category: string;
  amount: string;
  count: number;
}

export interface ProfitabilityGroupRow {
  id: string;
  label: string;
  orderCount: number;
  revenue: string;
  approvedExpenses: string;
  estimatedGrossProfit: string;
}

export interface ProfitabilityOrderRow {
  orderId: string;
  orderNumber: string;
  currency: string;
  revenue: string;
  approvedExpenses: string;
  estimatedGrossProfit: string;
}

export interface FinancialReport {
  filters: ReportFiltersEcho;
  receivablesAging: ReceivablesAgingBucket[];
  invoiceCollectionPerformance: InvoiceCollectionPerformance;
  expenseBreakdown: ExpenseBreakdownRow[];
  profitability: {
    label: string;
    byCustomer: ProfitabilityGroupRow[];
    byRoute: ProfitabilityGroupRow[];
    byDriver: ProfitabilityGroupRow[];
    byVehicle: ProfitabilityGroupRow[];
    byOrder: ProfitabilityOrderRow[];
  };
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

class ReportsAPI {
  async executiveOverview(params: ReportFilterParams): Promise<ExecutiveOverviewReport> {
    const response = await apiFetch(`/api/reports/executive-overview${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to load executive overview');
  }

  async operations(params: ReportFilterParams): Promise<OperationsReport> {
    const response = await apiFetch(`/api/reports/operations${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to load operations report');
  }

  async financial(params: ReportFilterParams): Promise<FinancialReport> {
    const response = await apiFetch(`/api/reports/financial${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to load financial report');
  }

  /// Exports as a raw CSV file (the backend bypasses its usual `{data}`
  /// envelope for this route specifically) — returns the blob + a filename
  /// parsed from Content-Disposition so the caller can trigger a real
  /// browser download.
  async export(type: ExportReportType, params: ReportFilterParams): Promise<{ blob: Blob; filename: string }> {
    const response = await apiFetch(`/api/reports/export${buildQuery({ ...params, type })}`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to export report');
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? `${type}.csv`;
    const blob = await response.blob();
    return { blob, filename };
  }
}

export const reportsAPI = new ReportsAPI();

export const reportKeys = {
  all: ['reports'] as const,
  executiveOverview: (params: ReportFilterParams) => [...reportKeys.all, 'executive-overview', params] as const,
  operations: (params: ReportFilterParams) => [...reportKeys.all, 'operations', params] as const,
  financial: (params: ReportFilterParams) => [...reportKeys.all, 'financial', params] as const,
};

export function useExecutiveOverviewQuery(params: ReportFilterParams, enabled = true) {
  return useQuery({
    queryKey: reportKeys.executiveOverview(params),
    queryFn: () => reportsAPI.executiveOverview(params),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useOperationsReportQuery(params: ReportFilterParams, enabled = true) {
  return useQuery({
    queryKey: reportKeys.operations(params),
    queryFn: () => reportsAPI.operations(params),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useFinancialReportQuery(params: ReportFilterParams, enabled = true) {
  return useQuery({
    queryKey: reportKeys.financial(params),
    queryFn: () => reportsAPI.financial(params),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useExportReportMutation() {
  return useMutation({
    mutationFn: ({ type, params }: { type: ExportReportType; params: ReportFilterParams }) =>
      reportsAPI.export(type, params),
  });
}
