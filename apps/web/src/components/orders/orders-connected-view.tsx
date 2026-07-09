'use client';

import { useEffect } from 'react';
import { useOrdersList } from '@/lib/api/orders';

export function OrdersConnectedView() {
  const { data: orders, loading, error, refetch } = useOrdersList({ page: 1, limit: 10 });

  // Data is fetched automatically by useOrdersList hook

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return "bg-success/10 text-success";
      case "IN_TRANSIT":
        return "bg-brand/10 text-brand";
      case "CONFIRMED":
        return "bg-warning/10 text-warning";
      case "DRAFT":
        return "bg-muted text-muted-foreground";
      case "CANCELLED":
        return "bg-destructive/10 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Draft",
      CONFIRMED: "Confirmed",
      IN_TRANSIT: "In Transit",
      DELIVERED: "Delivered",
      CANCELLED: "Cancelled",
    };
    return labels[status] || status;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "PAID":
        return "text-success";
      case "PENDING":
        return "text-warning";
      case "FAILED":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Orders Management</h1>
        <p className="mt-2 text-muted-foreground">View and manage all your orders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Total Orders</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">{loading ? "—" : orders.length}</div>
          <div className="mt-2 text-sm text-muted-foreground">{loading ? "Loading..." : "fetched"}</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">In Transit</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">
            {loading ? "—" : orders.filter(o => o.status === "IN_TRANSIT").length}
          </div>
          <div className="mt-2 text-sm text-brand">Being delivered</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Pending Payment</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">
            {loading ? "—" : orders.filter(o => o.paymentStatus === "PENDING").length}
          </div>
          <div className="mt-2 text-sm text-warning">Awaiting payment</div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Recent Orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading orders..." : error ? "Error loading orders" : `${orders.length} orders`}
          </p>
        </div>
        <div className="divide-y divide-brand/10">
          {loading && (
            <div className="px-8 py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
              <p className="mt-4 text-sm text-muted-foreground">Loading orders...</p>
            </div>
          )}
          {error && (
            <div className="px-8 py-6">
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                {error}
                <button
                  onClick={() => refetch()}
                  className="ml-2 font-semibold underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {!loading && !error && orders.length === 0 && (
            <div className="px-8 py-12 text-center">
              <p className="text-muted-foreground">No orders found</p>
            </div>
          )}
          {!loading && orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between border-b border-brand/5 px-8 py-5 transition-colors hover:bg-background/40"
            >
              <div className="flex-1">
                <div className="font-semibold text-foreground">{order.orderCode}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {order.customer?.companyName || "—"}
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="text-sm font-medium text-muted-foreground">{formatDate(order.scheduledDate)}</div>
                  <div className="mt-1 text-xs text-muted-foreground/70">{order.items?.length || 0} items</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-foreground">${parseFloat(order.totalAmount).toLocaleString()}</div>
                  <div className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                    {order.paymentStatus}
                  </div>
                </div>
                <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
