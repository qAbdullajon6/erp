import { formatMoney } from "@/lib/format";
import type { ExecutiveOverviewTotals } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard, type MetricTone } from "@/components/ui/metric-card";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Minus,
  Package,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface KpiCardsProps {
  totals: ExecutiveOverviewTotals | null;
  fleet: { available: number; total: number } | null;
  loading: boolean;
}

interface Kpi {
  label: string;
  value: string;
  icon: LucideIcon;
  note: string;
  tone: MetricTone;
}

/// Status colour never travels alone — each note carries an icon as well
/// (MetricCard's `note` prop), so the meaning survives colour-blindness and
/// forced-colours mode.
const NOTE_ICON: Record<MetricTone, LucideIcon> = {
  good: TrendingUp,
  warning: AlertTriangle,
  neutral: Minus,
};

export function KpiCards({ totals, fleet, loading }: KpiCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const kpis: Kpi[] = [
    {
      label: "Orders (30d)",
      value: totals ? totals.totalOrders.toLocaleString() : "—",
      icon: Package,
      note: totals ? `${totals.delayedOrders} delayed` : "No data",
      tone: totals && totals.delayedOrders > 0 ? "warning" : "neutral",
    },
    {
      label: "Fleet available",
      value: fleet ? `${fleet.available} / ${fleet.total}` : "—",
      icon: Truck,
      note: fleet ? "Ready to dispatch" : "Not available for your role",
      tone: "neutral",
    },
    {
      label: "On-time rate",
      value: totals ? `${totals.onTimeDeliveryRate.toFixed(1)}%` : "—",
      icon: CheckCircle2,
      note: totals ? `${totals.deliveredOrders} delivered` : "No data",
      tone: totals && totals.onTimeDeliveryRate >= 90 ? "good" : "warning",
    },
    {
      label: "Revenue (30d)",
      value: totals ? formatMoney(totals.totalRevenue) : "—",
      icon: DollarSign,
      note: totals ? `${formatMoney(totals.outstandingReceivables)} outstanding` : "No data",
      tone: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <MetricCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          note={{ icon: NOTE_ICON[kpi.tone], text: kpi.note, tone: kpi.tone }}
        />
      ))}
    </div>
  );
}
