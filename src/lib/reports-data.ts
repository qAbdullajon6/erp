// Aggregation helpers specific to the /reports workspace. Kept out of
// mock-data.ts because these combine multiple entities in ways only Reports
// needs — the core per-entity derive helpers (getOrderProfit, getInvoiceStatus,
// etc.) still live in mock-data.ts and are reused here rather than duplicated.

import { getReferenceNow, getOrderExpenses, getOrderProfit, wasOrderLate, isOrderDelayed, getInvoiceRemaining, getInvoiceStatus, getVehicleExpenseTotal, getOnTimeDeliveryRate } from "@/lib/mock-data";
import { isWithinRange, type DateBounds } from "@/lib/date-range";
import type { Driver, Expense, Invoice, Order, Vehicle } from "@/lib/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function routeLabel(order: Order): string {
  return `${order.origin} → ${order.destination}`;
}

export interface ReportFilterState {
  customerId: string;
  route: string;
  driverId: string;
  vehicleId: string;
  orderStatus: string;
  invoiceStatus: string;
  currency: string;
}

export const defaultReportFilters: ReportFilterState = {
  customerId: "all",
  route: "all",
  driverId: "all",
  vehicleId: "all",
  orderStatus: "all",
  invoiceStatus: "all",
  currency: "all",
};

export function isDefaultFilters(filters: ReportFilterState): boolean {
  return Object.entries(filters).every(([, v]) => v === "all");
}

export function filterOrdersForReport(
  orders: Order[],
  filters: ReportFilterState,
  bounds: DateBounds,
): Order[] {
  return orders.filter((o) => {
    if (!isWithinRange(o.createdAt, bounds)) return false;
    if (filters.customerId !== "all" && o.customerId !== filters.customerId) return false;
    if (filters.route !== "all" && routeLabel(o) !== filters.route) return false;
    if (filters.driverId !== "all" && o.driverId !== filters.driverId) return false;
    if (filters.vehicleId !== "all" && o.vehicleId !== filters.vehicleId) return false;
    if (filters.orderStatus !== "all" && o.status !== filters.orderStatus) return false;
    return true;
  });
}

/** bounds is optional: omit it for point-in-time views (e.g. receivables aging) that should ignore the date range. */
export function filterInvoicesForReport(
  invoices: Invoice[],
  orders: Order[],
  filters: ReportFilterState,
  bounds?: DateBounds,
): Invoice[] {
  return invoices.filter((inv) => {
    if (bounds && !isWithinRange(inv.issuedAt, bounds)) return false;
    if (filters.customerId !== "all" && inv.customerId !== filters.customerId) return false;
    if (filters.invoiceStatus !== "all" && getInvoiceStatus(inv) !== filters.invoiceStatus) return false;
    if (filters.currency !== "all" && inv.currency !== filters.currency) return false;
    if (filters.driverId !== "all" || filters.vehicleId !== "all" || filters.route !== "all") {
      const order = inv.orderId ? orders.find((o) => o.id === inv.orderId) : undefined;
      if (filters.driverId !== "all" && order?.driverId !== filters.driverId) return false;
      if (filters.vehicleId !== "all" && order?.vehicleId !== filters.vehicleId) return false;
      if (filters.route !== "all" && (!order || routeLabel(order) !== filters.route)) return false;
    }
    return true;
  });
}

export function filterExpensesForReport(
  expenses: Expense[],
  orders: Order[],
  filters: ReportFilterState,
  bounds: DateBounds,
): Expense[] {
  return expenses.filter((e) => {
    if (!isWithinRange(e.date, bounds)) return false;
    if (filters.currency !== "all" && e.currency !== filters.currency) return false;
    if (filters.driverId !== "all" && e.driverId !== filters.driverId) return false;
    if (filters.vehicleId !== "all" && e.vehicleId !== filters.vehicleId) return false;
    if (filters.customerId !== "all" || filters.route !== "all") {
      const order = e.orderId ? orders.find((o) => o.id === e.orderId) : undefined;
      if (filters.customerId !== "all" && order?.customerId !== filters.customerId) return false;
      if (filters.route !== "all" && (!order || routeLabel(order) !== filters.route)) return false;
    }
    return true;
  });
}

export interface DriverPerformanceStats {
  driver: Driver;
  totalAssignments: number;
  deliveredCount: number;
  onTimeRate: number;
  delayedCount: number;
  cancelledCount: number;
  revenueContribution: number;
}

export function getDriverPerformanceStats(
  driver: Driver,
  scopedOrders: Order[],
): DriverPerformanceStats {
  const driverOrders = scopedOrders.filter((o) => o.driverId === driver.id);
  const delivered = driverOrders.filter((o) => o.status === "delivered");
  const cancelled = driverOrders.filter((o) => o.status === "cancelled");
  const delayed = driverOrders.filter(wasOrderLate);
  const onTimeRate =
    delivered.length > 0
      ? Math.round(((delivered.length - delivered.filter(wasOrderLate).length) / delivered.length) * 100)
      : 100;

  return {
    driver,
    totalAssignments: driverOrders.length,
    deliveredCount: delivered.length,
    onTimeRate,
    delayedCount: delayed.length,
    cancelledCount: cancelled.length,
    revenueContribution: delivered.reduce((sum, o) => sum + o.amount, 0),
  };
}

export interface VehicleUtilizationStats {
  vehicle: Vehicle;
  assignments: number;
  deliveredCount: number;
  revenueContribution: number;
  approvedExpenses: number;
}

export function getVehicleUtilizationStats(
  vehicle: Vehicle,
  scopedOrders: Order[],
  allExpenses: Expense[],
): VehicleUtilizationStats {
  const vehicleOrders = scopedOrders.filter((o) => o.vehicleId === vehicle.id);
  const delivered = vehicleOrders.filter((o) => o.status === "delivered");

  return {
    vehicle,
    assignments: vehicleOrders.length,
    deliveredCount: delivered.length,
    revenueContribution: delivered.reduce((sum, o) => sum + o.amount, 0),
    approvedExpenses: getVehicleExpenseTotal(vehicle.id, allExpenses),
  };
}

export interface RoutePerformanceStats {
  route: string;
  totalOrders: number;
  deliveryCount: number;
  /** null when no delivered order on this route has both a picked_up and delivered status-history entry. */
  avgDeliveryDurationHours: number | null;
  delayRatePercent: number;
  revenue: number;
  expenses: number;
  grossProfit: number;
  marginPercent: number;
}

export function getRoutePerformanceStats(
  scopedOrders: Order[],
  allExpenses: Expense[],
): RoutePerformanceStats[] {
  const byRoute = new Map<string, Order[]>();
  for (const o of scopedOrders) {
    const route = `${o.origin} → ${o.destination}`;
    byRoute.set(route, [...(byRoute.get(route) ?? []), o]);
  }

  return Array.from(byRoute.entries())
    .map(([route, routeOrders]) => {
      const delivered = routeOrders.filter((o) => o.status === "delivered");
      const durations = delivered
        .map((o) => {
          const pickedUp = o.statusHistory.find((h) => h.status === "picked_up");
          const deliveredAt = o.statusHistory.find((h) => h.status === "delivered");
          if (!pickedUp || !deliveredAt) return null;
          return (new Date(deliveredAt.at).getTime() - new Date(pickedUp.at).getTime()) / (60 * 60 * 1000);
        })
        .filter((d): d is number => d !== null);
      const avgDeliveryDurationHours =
        durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null;

      const delayedCount = routeOrders.filter(wasOrderLate).length;
      const revenue = delivered.reduce((sum, o) => sum + o.amount, 0);
      const cost = delivered.reduce(
        (sum, o) => sum + getOrderExpenses(o.id, allExpenses).reduce((s, e) => s + e.amount, 0),
        0,
      );

      return {
        route,
        totalOrders: routeOrders.length,
        deliveryCount: delivered.length,
        avgDeliveryDurationHours,
        delayRatePercent: routeOrders.length > 0 ? (delayedCount / routeOrders.length) * 100 : 0,
        revenue,
        expenses: cost,
        grossProfit: revenue - cost,
        marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface OrderExceptions {
  delayed: Order[];
  unassigned: Order[];
  cancelled: Order[];
  negativeProfit: Order[];
  deliveredWithoutInvoice: Order[];
}

export function getOrderExceptions(
  scopedOrders: Order[],
  allExpenses: Expense[],
  allInvoices: Invoice[],
): OrderExceptions {
  return {
    delayed: scopedOrders.filter(isOrderDelayed),
    unassigned: scopedOrders.filter((o) => o.status === "pending" && !o.driverId),
    cancelled: scopedOrders.filter((o) => o.status === "cancelled"),
    negativeProfit: scopedOrders.filter(
      (o) => o.status === "delivered" && getOrderProfit(o, allExpenses, allInvoices) < 0,
    ),
    deliveredWithoutInvoice: scopedOrders.filter(
      (o) => o.status === "delivered" && !allInvoices.some((i) => i.orderId === o.id),
    ),
  };
}

export interface AgingBucket {
  key: string;
  label: string;
  count: number;
  amount: number;
}

export function getReceivablesAging(allInvoices: Invoice[]): AgingBucket[] {
  const now = getReferenceNow().getTime();
  const buckets: AgingBucket[] = [
    { key: "current", label: "Current", count: 0, amount: 0 },
    { key: "d1_30", label: "1–30 days overdue", count: 0, amount: 0 },
    { key: "d31_60", label: "31–60 days overdue", count: 0, amount: 0 },
    { key: "d61_90", label: "61–90 days overdue", count: 0, amount: 0 },
    { key: "d90plus", label: "90+ days overdue", count: 0, amount: 0 },
  ];

  for (const inv of allInvoices) {
    if (inv.manualStatus === "cancelled") continue;
    const remaining = getInvoiceRemaining(inv);
    if (remaining <= 0) continue;
    const daysOverdue = Math.floor((now - new Date(inv.dueAt).getTime()) / ONE_DAY_MS);
    const bucket =
      daysOverdue <= 0
        ? buckets[0]
        : daysOverdue <= 30
          ? buckets[1]
          : daysOverdue <= 60
            ? buckets[2]
            : daysOverdue <= 90
              ? buckets[3]
              : buckets[4];
    bucket.count += 1;
    bucket.amount += remaining;
  }

  return buckets;
}

export interface InvoiceCollectionStats {
  issuedCount: number;
  issuedAmount: number;
  paidCount: number;
  paidAmount: number;
  partiallyPaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  collectionRatePercent: number;
  avgPaymentDelayDays: number | null;
}

export function getInvoiceCollectionStats(allInvoices: Invoice[]): InvoiceCollectionStats {
  const active = allInvoices.filter((i) => i.manualStatus !== "cancelled");
  const paid = active.filter((i) => getInvoiceStatus(i) === "paid");
  const partiallyPaid = active.filter((i) => getInvoiceStatus(i) === "partially_paid");
  const overdue = active.filter((i) => getInvoiceStatus(i) === "overdue");

  const issuedAmount = active.reduce((sum, i) => sum + i.amount, 0);
  const paidAmount = paid.reduce((sum, i) => sum + i.amount, 0);

  const delays = paid
    .map((i) => {
      const lastPayment = i.payments.reduce(
        (latest, p) => (new Date(p.paidAt) > new Date(latest.paidAt) ? p : latest),
        i.payments[0],
      );
      if (!lastPayment) return null;
      return (new Date(lastPayment.paidAt).getTime() - new Date(i.dueAt).getTime()) / ONE_DAY_MS;
    })
    .filter((d): d is number => d !== null);

  return {
    issuedCount: active.length,
    issuedAmount,
    paidCount: paid.length,
    paidAmount,
    partiallyPaidCount: partiallyPaid.length,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, i) => sum + getInvoiceRemaining(i), 0),
    collectionRatePercent: issuedAmount > 0 ? (paidAmount / issuedAmount) * 100 : 0,
    avgPaymentDelayDays: delays.length > 0 ? delays.reduce((s, d) => s + d, 0) / delays.length : null,
  };
}

export interface BreakdownRow {
  key: string;
  amount: number;
  count: number;
}

export function getExpenseBreakdownBy(
  allExpenses: Expense[],
  keyFn: (e: Expense) => string | undefined,
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const e of allExpenses) {
    if (e.approvalStatus !== "approved") continue;
    const key = keyFn(e) ?? "Unassigned";
    const row = map.get(key) ?? { key, amount: 0, count: 0 };
    row.amount += e.amount;
    row.count += 1;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export function getCustomerProfit(
  customerId: string,
  allOrders: Order[],
  allExpenses: Expense[],
  allInvoices: Invoice[],
): number {
  return allOrders
    .filter((o) => o.customerId === customerId && o.status === "delivered")
    .reduce((sum, o) => sum + getOrderProfit(o, allExpenses, allInvoices), 0);
}

export function getDriverProfit(
  driverId: string,
  allOrders: Order[],
  allExpenses: Expense[],
  allInvoices: Invoice[],
): number {
  return allOrders
    .filter((o) => o.driverId === driverId && o.status === "delivered")
    .reduce((sum, o) => sum + getOrderProfit(o, allExpenses, allInvoices), 0);
}

export function getVehicleProfit(
  vehicleId: string,
  allOrders: Order[],
  allExpenses: Expense[],
  allInvoices: Invoice[],
): number {
  return allOrders
    .filter((o) => o.vehicleId === vehicleId && o.status === "delivered")
    .reduce((sum, o) => sum + getOrderProfit(o, allExpenses, allInvoices), 0);
}

export interface ExecutiveStats {
  totalOrders: number;
  deliveredOrders: number;
  onTimeRatePercent: number;
  delayedDeliveries: number;
  revenue: number;
  collectedPayments: number;
  outstandingReceivables: number;
  approvedExpenses: number;
  grossProfit: number;
  grossMarginPercent: number;
}

export function computeExecutiveStats(
  data: { orders: Order[]; invoices: Invoice[]; expenses: Expense[] },
  filters: ReportFilterState,
  bounds: DateBounds,
): ExecutiveStats {
  const scopedOrders = filterOrdersForReport(data.orders, filters, bounds);
  const delivered = scopedOrders.filter((o) => o.status === "delivered");
  const delayed = scopedOrders.filter(wasOrderLate);

  const dimensionInvoices = filterInvoicesForReport(data.invoices, data.orders, filters);
  const collectedPayments = dimensionInvoices
    .flatMap((i) => i.payments)
    .filter((p) => isWithinRange(p.paidAt, bounds))
    .reduce((sum, p) => sum + p.amount, 0);
  const outstandingReceivables = dimensionInvoices.reduce(
    (sum, i) => sum + getInvoiceRemaining(i),
    0,
  );

  const scopedExpenses = filterExpensesForReport(data.expenses, data.orders, filters, bounds).filter(
    (e) => e.approvalStatus === "approved",
  );

  const revenue = delivered.reduce((sum, o) => sum + o.amount, 0);
  const approvedExpenses = scopedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const grossProfit = revenue - approvedExpenses;

  return {
    totalOrders: scopedOrders.length,
    deliveredOrders: delivered.length,
    onTimeRatePercent: getOnTimeDeliveryRate(scopedOrders),
    delayedDeliveries: delayed.length,
    revenue,
    collectedPayments,
    outstandingReceivables,
    approvedExpenses,
    grossProfit,
    grossMarginPercent: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
  };
}
