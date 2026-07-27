import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { DelayedOrderRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface DelayedDeliveriesProps {
  orders: DelayedOrderRow[];
  total: number;
  loading: boolean;
  unassignedIds?: Set<string>;
  canDispatch?: boolean;
}

function daysOverdue(deliveryDate: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(deliveryDate).getTime()) / 86_400_000));
}

export function DelayedDeliveries({
  orders,
  total,
  loading,
  unassignedIds,
  canDispatch,
}: DelayedDeliveriesProps) {
  if (loading) return <Skeleton className="h-56 rounded-xl" />;

  return (
    <SurfaceCard className={cn("flex h-full flex-col", total > 0 && "border-destructive/25")}>
      <SurfaceCardHeader className="py-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Delayed</h3>
          <p className="text-[11px] text-muted-foreground">Past promised delivery</p>
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
            total > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
          )}
        >
          {total > 0 ? total : "Clear"}
        </span>
      </SurfaceCardHeader>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-6">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <p className="text-sm font-medium">Nothing delayed</p>
        </div>
      ) : (
        <div className="max-h-52 flex-1 space-y-1 overflow-y-auto px-2 py-1.5 scrollbar-thin">
          {orders.map((item) => {
            const days = daysOverdue(item.deliveryDate);
            const needsAssign = unassignedIds?.has(item.orderId) ?? false;
            return (
              <div
                key={item.orderId}
                className="flex items-center gap-2 rounded-md border border-destructive/10 bg-destructive/[0.03] px-2 py-1.5"
              >
                <Link
                  to="/app/orders/$orderId"
                  params={{ orderId: item.orderId }}
                  className="min-w-0 flex-1"
                >
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {item.customerName ? `${item.customerName} · ` : ""}
                    {item.pickupCity} → {item.deliveryCity}
                  </div>
                  <div className="mt-0.5 flex gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{item.orderNumber}</span>
                    <span className="tabular-nums">{formatMoney(item.price, item.currency)}</span>
                  </div>
                </Link>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {days}d
                </span>
                {needsAssign && canDispatch ? (
                  <Link
                    to="/app/dispatches/create"
                    search={{ orderId: item.orderId }}
                    className="shrink-0 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-brand-foreground"
                  >
                    Assign
                  </Link>
                ) : (
                  <Link
                    to="/app/orders/$orderId"
                    params={{ orderId: item.orderId }}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-brand hover:text-brand"
                  >
                    Open
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SurfaceCard>
  );
}
