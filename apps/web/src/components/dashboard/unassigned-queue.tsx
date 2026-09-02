import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import type { BoardOrderSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface UnassignedQueueProps {
  orders: BoardOrderSummary[];
  loading: boolean;
  canDispatch: boolean;
}

type Priority = "P1" | "P2" | "P3";

function priorityOf(
  order: BoardOrderSummary,
  now: number,
): { priority: Priority; risk: string; wait: string } {
  const delivery = new Date(order.deliveryDate).getTime();
  const pickup = new Date(order.pickupDate).getTime();
  const created = order.createdAt ? new Date(order.createdAt).getTime() : pickup;

  if (delivery < now) {
    const days = Math.max(1, Math.floor((now - delivery) / 86_400_000));
    return {
      priority: "P1",
      risk: `${days}d late`,
      wait: formatRelativeTime(new Date(created).toISOString()),
    };
  }
  if (pickup < now) {
    const hours = Math.max(1, Math.floor((now - pickup) / 3_600_000));
    return {
      priority: "P1",
      risk: `Pickup +${hours}h`,
      wait: formatRelativeTime(new Date(created).toISOString()),
    };
  }
  const hoursToPickup = (pickup - now) / 3_600_000;
  if (hoursToPickup <= 24) {
    return {
      priority: "P2",
      risk: hoursToPickup < 1 ? "Pickup <1h" : `Pickup ${Math.round(hoursToPickup)}h`,
      wait: formatRelativeTime(new Date(created).toISOString()),
    };
  }
  return {
    priority: "P3",
    risk: new Date(order.pickupDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    wait: formatRelativeTime(new Date(created).toISOString()),
  };
}

const PRI_STYLE: Record<Priority, string> = {
  P1: "bg-destructive/15 text-destructive",
  P2: "bg-warning/15 text-warning",
  P3: "bg-muted text-muted-foreground",
};

export function UnassignedQueue({ orders, loading, canDispatch }: UnassignedQueueProps) {
  if (loading) return <Skeleton className="h-56 rounded-xl" />;

  const now = Date.now();
  const ranked = [...orders]
    .map((o) => ({ order: o, ...priorityOf(o, now) }))
    .sort(
      (a, b) =>
        a.priority.localeCompare(b.priority) ||
        new Date(a.order.pickupDate).getTime() - new Date(b.order.pickupDate).getTime(),
    )
    .slice(0, 10);

  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader className="py-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Needs dispatch</h3>
          <p className="text-[11px] text-muted-foreground">Unassigned · priority order</p>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warning">
              {orders.length}
            </span>
          )}
          <Link
            to="/app/dispatches/board"
            className="text-[11px] font-medium text-brand hover:underline"
          >
            Board
          </Link>
        </div>
      </SurfaceCardHeader>

      {orders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-6 text-center">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <p className="text-sm font-medium text-foreground">Queue clear</p>
        </div>
      ) : (
        <div className="max-h-72 flex-1 divide-y divide-border/40 overflow-y-auto scrollbar-thin">
          {ranked.map(({ order, priority, risk, wait }) => (
            <div key={order.id} className="flex items-center gap-2.5 px-3 py-2.5">
              {/* Priority badge */}
              <span
                className={cn(
                  "w-7 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold",
                  PRI_STYLE[priority],
                )}
              >
                {priority}
              </span>

              {/* Route + customer */}
              <Link
                to="/app/orders/$orderId"
                params={{ orderId: order.id }}
                className="min-w-0 flex-1"
              >
                {/* Primary: route */}
                <div className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
                  <span className="truncate">{order.pickupCity}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{order.deliveryCity}</span>
                </div>
                {/* Secondary: customer + meta */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {order.customerName && (
                    <span className="truncate font-medium">{order.customerName}</span>
                  )}
                  <span className="font-mono text-muted-foreground/70">{order.orderNumber}</span>
                  <span className={cn(priority === "P1" && "font-medium text-destructive")}>
                    {risk}
                  </span>
                  <span>wait {wait}</span>
                  {order.price != null && (
                    <span className="tabular-nums">
                      {formatMoney(order.price, order.currency ?? "USD")}
                    </span>
                  )}
                </div>
              </Link>

              {/* CTA */}
              {canDispatch && (
                <Link
                  to="/app/dispatches/create"
                  search={{ orderId: order.id }}
                  className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-foreground hover:opacity-90"
                >
                  Assign
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}
