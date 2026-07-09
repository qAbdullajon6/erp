import type { OrdersByStatusRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { statusLabel } from "@/components/shared/status-badge";

interface DeliveryStatusChartProps {
  data: OrdersByStatusRow[];
  loading: boolean;
}

/// Reserved status colours, used here for the thing they actually mean.
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted-foreground/40",
  PENDING: "bg-warning",
  ASSIGNED: "bg-brand/70",
  PICKED_UP: "bg-brand",
  IN_TRANSIT: "bg-brand",
  DELIVERED: "bg-success",
  CANCELLED: "bg-destructive",
};

export function DeliveryStatusChart({ data, loading }: DeliveryStatusChartProps) {
  if (loading) {
    return <Skeleton className="h-[22rem] rounded-2xl" />;
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const sorted = [...data].sort((a, b) => b.count - a.count);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Orders by status</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Last 30 days</p>
      </div>

      <div className="mt-6 space-y-4">
        {total === 0 && <p className="text-sm text-muted-foreground">No orders in this period yet.</p>}

        {sorted.map((item) => {
          const share = total > 0 ? (item.count / total) * 100 : 0;
          return (
            <div key={item.status}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{statusLabel(item.status)}</span>
                {/* Count plus share: the bar length alone is hard to read at these widths. */}
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{item.count}</span>
                  <span className="ml-2 tabular-nums">{share.toFixed(0)}%</span>
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
                <div
                  className={`h-full rounded-full ${STATUS_COLORS[item.status] ?? "bg-brand"}`}
                  style={{ width: `${share}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* mt-auto pins the total to the card's foot, so the card can stretch to
          match the chart beside it without leaving a well of empty surface. */}
      {total > 0 && (
        <div className="mt-auto flex items-baseline justify-between border-t border-brand/10 pt-4">
          <span className="text-sm text-muted-foreground">Total orders</span>
          <span className="text-2xl font-semibold leading-none text-foreground">{total}</span>
        </div>
      )}
    </div>
  );
}
