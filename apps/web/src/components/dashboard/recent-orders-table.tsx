import { Link } from "@tanstack/react-router";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import type { RecentOrderRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentOrdersTableProps {
  orders: RecentOrderRow[];
  loading: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function getStatusColor(status: string) {
  switch (status) {
    case "DELIVERED":
      return "bg-success/10 text-success";
    case "IN_TRANSIT":
    case "PICKED_UP":
    case "ASSIGNED":
      return "bg-brand/10 text-brand";
    case "PENDING":
      return "bg-warning/10 text-warning";
    case "CANCELLED":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function RecentOrdersTable({ orders, loading }: RecentOrdersTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
      <div className="border-b border-brand/10 px-8 py-6">
        <h3 className="font-display text-2xl font-bold text-foreground">Recent Orders</h3>
        <p className="mt-1 text-sm text-muted-foreground">Latest orders across the organization</p>
      </div>
      <div className="divide-y divide-brand/10">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-8 py-4">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        {!loading && orders.length === 0 && (
          <div className="px-8 py-12 text-center text-sm text-muted-foreground">No orders yet</div>
        )}
        {!loading &&
          orders.map((order) => (
            <Link
              key={order.id}
              to="/app/orders/$orderId"
              params={{ orderId: order.id }}
              className="flex items-center justify-between border-b border-brand/5 px-8 py-4 transition-colors hover:bg-background/40"
            >
              <div className="flex-1">
                <div className="font-medium text-foreground">
                  {order.pickupCity} → {order.deliveryCity}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{order.orderNumber}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-foreground">{formatMoney(order.price, order.currency)}</div>
                <div className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </div>
              </div>
              <div className="ml-6 text-right text-sm text-muted-foreground">{formatRelativeTime(order.createdAt)}</div>
            </Link>
          ))}
      </div>
    </div>
  );
}
