import { formatMoney } from "@/lib/format";
import type { ExecutiveOverviewTotals } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
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

type Tone = "good" | "warning" | "neutral";

interface Kpi {
  label: string;
  value: string;
  icon: LucideIcon;
  note: string;
  tone: Tone;
}

/// Status colour never travels alone — each note carries an icon as well, so the
/// meaning survives colour-blindness and forced-colours mode.
const TONE_STYLES: Record<Tone, { text: string; icon: LucideIcon }> = {
  good: { text: "text-success", icon: TrendingUp },
  warning: { text: "text-warning", icon: AlertTriangle },
  neutral: { text: "text-muted-foreground", icon: Minus },
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
      {kpis.map((kpi) => {
        const tone = TONE_STYLES[kpi.tone];
        const NoteIcon = tone.icon;
        return (
          <div
            key={kpi.label}
            className="group relative overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-5 transition-all duration-200 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10"
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/5 blur-3xl transition-all duration-200 group-hover:bg-brand/10" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                {/* Sans, not the display face: a stat-tile value is data, not a headline. */}
                <p className="mt-2 text-3xl font-semibold leading-none text-foreground">{kpi.value}</p>
                <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${tone.text}`}>
                  <NoteIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{kpi.note}</span>
                </p>
              </div>
              <span className="shrink-0 rounded-xl bg-brand/10 p-2.5 text-brand">
                <kpi.icon className="h-5 w-5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
