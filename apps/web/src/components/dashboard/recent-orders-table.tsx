import { Link } from "@tanstack/react-router";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import type { RecentOrderRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/list-states";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { SectionHeader } from "@/components/ui/section-header";
import { ArrowRight, Package } from "lucide-react";

interface RecentOrdersTableProps {
  orders: RecentOrderRow[];
  loading: boolean;
}

export function RecentOrdersTable({ orders, loading }: RecentOrdersTableProps) {
  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader>
        <SectionHeader title="Recent activity" subtitle="Latest orders across the organization" />
        <Link
          to="/app/orders"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </SurfaceCardHeader>

      <div className="flex-1 divide-y divide-brand/10">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-4">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}

        {!loading && orders.length === 0 && (
          <EmptyState icon={Package} title="No orders yet" description="New orders will show up here as they come in." />
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
    </SurfaceCard>
  );
}
