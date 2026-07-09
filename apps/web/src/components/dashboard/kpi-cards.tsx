import { formatMoney } from "@/lib/format";
import type { ExecutiveOverviewTotals } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardsProps {
  totals: ExecutiveOverviewTotals | null;
  fleet: { available: number; total: number } | null;
  loading: boolean;
}

export function KpiCards({ totals, fleet, loading }: KpiCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const kpis = [
    {
      label: "Orders (30d)",
      value: totals ? totals.totalOrders.toLocaleString() : "—",
      change: totals ? `${totals.delayedOrders} delayed` : "No data",
      trend: totals && totals.delayedOrders > 0 ? ("down" as const) : ("neutral" as const),
    },
    {
      label: "Fleet available",
      value: fleet ? `${fleet.available} / ${fleet.total}` : "—",
      change: fleet ? "ready to dispatch" : "Not available for your role",
      trend: "neutral" as const,
    },
    {
      label: "On-time rate",
      value: totals ? `${totals.onTimeDeliveryRate.toFixed(1)}%` : "—",
      change: totals ? `${totals.deliveredOrders} delivered` : "No data",
      trend: totals && totals.onTimeDeliveryRate >= 90 ? ("up" as const) : ("neutral" as const),
    },
    {
      label: "Revenue (30d)",
      value: totals ? formatMoney(totals.totalRevenue) : "—",
      change: totals ? `${formatMoney(totals.outstandingReceivables)} outstanding` : "No data",
      trend: "up" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="group relative overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6 transition-all duration-200 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10"
        >
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/5 blur-3xl transition-all duration-200 group-hover:bg-brand/10" />
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {kpi.label}
            </div>
            <div className="mt-3 font-display text-3xl font-bold text-foreground">
              {kpi.value}
            </div>
            <div
              className={`mt-2 text-sm font-medium ${
                kpi.trend === "up"
                  ? "text-success"
                  : kpi.trend === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {kpi.change}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
