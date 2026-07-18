import { TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { ExecutiveOverviewTotals } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard, type MetricCardProps } from "@/components/ui/metric-card";

interface FinancialOverviewProps {
  totals: ExecutiveOverviewTotals | null;
  loading: boolean;
}

/// Every figure here already existed on ExecutiveOverviewTotals — the
/// dashboard only ever surfaced totalRevenue. approvedExpenses,
/// estimatedGrossProfit, and outstandingReceivables were already in the
/// response and unused. Weighted rather than four equal tiles: Revenue is
/// the headline figure, Profit the runner-up, Expenses/Outstanding are
/// supporting context.
export function FinancialOverview({ totals, loading }: FinancialOverviewProps) {
  if (loading) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }

  const tiles: Array<{ label: string; value: string; icon: MetricCardProps["icon"]; emphasis: MetricCardProps["emphasis"] }> = [
    { label: "Revenue", value: totals ? formatMoney(totals.totalRevenue) : "—", icon: TrendingUp, emphasis: "primary" },
    {
      label: "Est. Profit",
      value: totals ? formatMoney(totals.estimatedGrossProfit) : "—",
      icon: Wallet,
      emphasis: "secondary",
    },
    {
      label: "Expenses",
      value: totals ? formatMoney(totals.approvedExpenses) : "—",
      icon: TrendingDown,
      emphasis: "default",
    },
    {
      label: "Outstanding",
      value: totals ? formatMoney(totals.outstandingReceivables) : "—",
      icon: Receipt,
      emphasis: "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <MetricCard key={tile.label} variant="compact" label={tile.label} value={tile.value} icon={tile.icon} emphasis={tile.emphasis} />
      ))}
    </div>
  );
}
