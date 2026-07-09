import { Link } from "@tanstack/react-router";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import type { RecentOrderRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { ArrowRight, Package } from "lucide-react";

interface RecentOrdersTableProps {
  orders: RecentOrderRow[];
  loading: boolean;
}

export function RecentOrdersTable({ orders, loading }: RecentOrdersTableProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
      <div className="flex items-center justify-between gap-4 border-b border-brand/10 px-6 py-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent orders</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Latest orders across the organization</p>
        </div>
        <Link
          to="/app/orders"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex-1 divide-y divide-brand/10">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-4">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="rounded-full bg-muted p-3">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">No orders yet</p>
          </div>
        )}

        {!loading &&
          orders.map((order) => (
            <Link
              key={order.id}
              to="/app/orders/$orderId"
              params={{ orderId: order.id }}
              className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-background/40"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">
                  {order.pickupCity} → {order.deliveryCity}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{order.orderNumber}</div>
              </div>

              <div className="shrink-0 text-right">
                <div className="font-semibold text-foreground">{formatMoney(order.price, order.currency)}</div>
                <div className="mt-1">
                  <StatusBadge status={order.status} />
                </div>
              </div>

              <div className="hidden w-20 shrink-0 text-right text-sm text-muted-foreground sm:block">
                {formatRelativeTime(order.createdAt)}
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
