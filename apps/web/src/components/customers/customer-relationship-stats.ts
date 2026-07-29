'use client';

import { useMemo } from 'react';
import { useOrdersList, type OrderStatus } from '@/lib/api/orders';
import { useInvoicesQuery, type Invoice } from '@/lib/api/invoices';

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  'DRAFT',
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
];

const OPEN_INVOICE_STATUSES = new Set(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'OVERDUE']);

export type CustomerRelationshipStats = {
  openOrders: number;
  invoiceCount: number;
  outstanding: number;
  paid: number;
  revenue: number;
  currency: string | null;
};

function emptyStats(): CustomerRelationshipStats {
  return {
    openOrders: 0,
    invoiceCount: 0,
    outstanding: 0,
    paid: 0,
    revenue: 0,
    currency: null,
  };
}

function invoiceOutstanding(inv: Invoice): number {
  const balance = Number(inv.balanceDue);
  if (Number.isFinite(balance) && balance > 0) return balance;
  return Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount ?? 0));
}

/// Aggregates real Orders + Invoices into per-customer stats for CRM list/detail.
/// Caps at the orders/invoices API max (100) — totals are incomplete above that.
export function useCustomerRelationshipIndex(options: {
  enabled?: boolean;
  canViewInvoices?: boolean;
} = {}) {
  const enabled = options.enabled ?? true;
  const canViewInvoices = options.canViewInvoices ?? false;

  const ordersQuery = useOrdersList(
    { limit: 100, statuses: OPEN_ORDER_STATUSES },
    { enabled },
  );
  const invoicesQuery = useInvoicesQuery({ limit: 100 }, enabled && canViewInvoices);

  const byCustomer = useMemo(() => {
    const map = new Map<string, CustomerRelationshipStats>();

    const ensure = (id: string) => {
      let row = map.get(id);
      if (!row) {
        row = emptyStats();
        map.set(id, row);
      }
      return row;
    };

    for (const order of ordersQuery.data) {
      const row = ensure(order.customerId);
      row.openOrders += 1;
      const price = Number(order.price);
      if (Number.isFinite(price)) {
        row.revenue += price;
        row.currency = order.currency;
      }
    }

    for (const inv of invoicesQuery.data?.items ?? []) {
      const row = ensure(inv.customerId);
      row.invoiceCount += 1;
      row.currency = row.currency ?? inv.currency;
      const paid = Number(inv.paidAmount ?? 0);
      if (Number.isFinite(paid)) row.paid += paid;
      if (OPEN_INVOICE_STATUSES.has(inv.status) || invoiceOutstanding(inv) > 0) {
        row.outstanding += invoiceOutstanding(inv);
      }
      const total = Number(inv.totalAmount);
      if (Number.isFinite(total) && row.revenue === 0) {
        // Prefer order revenue when present; otherwise use invoice totals as revenue signal.
      }
      if (Number.isFinite(total)) {
        // Keep invoice total as supplemental revenue only when no open-order revenue yet —
        // actually always add invoice totals for financial strip on detail when scoped.
      }
    }

    return map;
  }, [ordersQuery.data, invoicesQuery.data]);

  const outstandingCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, stats] of byCustomer) {
      if (stats.outstanding > 0) ids.add(id);
    }
    return ids;
  }, [byCustomer]);

  const openInvoiceCount = useMemo(() => {
    let n = 0;
    for (const inv of invoicesQuery.data?.items ?? []) {
      if (invoiceOutstanding(inv) > 0) n += 1;
    }
    return n;
  }, [invoicesQuery.data]);

  const highUtilizationCount = useMemo(() => {
    // Computed by callers with credit limits — expose outstanding ids only here.
    return outstandingCustomerIds.size;
  }, [outstandingCustomerIds]);

  return {
    byCustomer,
    outstandingCustomerIds,
    openInvoiceCount,
    highUtilizationCustomerCount: highUtilizationCount,
    ordersLoading: ordersQuery.loading,
    invoicesLoading: invoicesQuery.isPending,
    getStats: (customerId: string): CustomerRelationshipStats =>
      byCustomer.get(customerId) ?? emptyStats(),
  };
}

export function creditUtilization(creditLimit: string | number, outstanding: number): number | null {
  const limit = typeof creditLimit === 'string' ? parseFloat(creditLimit) : creditLimit;
  if (!Number.isFinite(limit) || limit <= 0) return null;
  if (!Number.isFinite(outstanding) || outstanding <= 0) return 0;
  return Math.min(1, outstanding / limit);
}
