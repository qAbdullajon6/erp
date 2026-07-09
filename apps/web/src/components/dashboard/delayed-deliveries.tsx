import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/format";
import type { DelayedOrderRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface DelayedDeliveriesProps {
  orders: DelayedOrderRow[];
  loading: boolean;
}

export function DelayedDeliveries({ orders, loading }: DelayedDeliveriesProps) {
  if (loading) {
    return <Skeleton className="h-48 rounded-2xl" />;
  }

  if (orders.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-success/20 bg-gradient-to-br from-success/5 to-success/10 p-6">
        <h3 className="font-display text-lg font-bold text-foreground">Delayed Deliveries</h3>
        <p className="mt-3 text-sm text-muted-foreground">Nothing is delayed right now. Fleet is on schedule.</p>
      </div>
    );
  }

  const shown = orders.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-2xl border border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-foreground">Delayed Deliveries</h3>
        <span className="rounded-full bg-destructive/20 px-3 py-1 text-sm font-semibold text-destructive">
          {orders.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {shown.map((item) => (
          <Link
            key={item.orderId}
            to="/app/orders/$orderId"
            params={{ orderId: item.orderId }}
            className="block rounded-lg bg-background/60 p-3 transition-colors hover:bg-background/80"
          >
            <div className="text-sm font-medium text-foreground">
              {item.pickupCity} → {item.deliveryCity}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.orderNumber}</span>
              <span className="text-destructive">
                due {new Date(item.deliveryDate).toLocaleDateString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{formatMoney(item.price, item.currency)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
