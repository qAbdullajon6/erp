import type { OrdersByStatusRow } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface DeliveryStatusChartProps {
  data: OrdersByStatusRow[];
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
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8">
      <div>
        <h3 className="font-display text-2xl font-bold text-foreground">Orders by Status</h3>
        <p className="mt-1 text-sm text-muted-foreground">Last 30 days</p>
      </div>
      <div className="mt-8 space-y-4">
        {total === 0 && (
          <p className="text-sm text-muted-foreground">No orders in this period yet.</p>
        )}
        {sorted.map((item) => (
          <div key={item.status}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{STATUS_LABELS[item.status] ?? item.status}</span>
              <span className="font-semibold text-foreground">{item.count}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
              <div
                className={`h-full ${STATUS_COLORS[item.status] ?? "bg-brand"}`}
                style={{ width: total > 0 ? `${(item.count / total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
