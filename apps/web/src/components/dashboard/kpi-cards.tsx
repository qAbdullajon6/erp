import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  DollarSign,
  FileText,
  Minus,
  Truck,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/lib/api/dashboard";

interface KpiCardsProps {
  data: DashboardSummary | null;
  loading: boolean;
}

function percentChange(current: number, previous: number): { label: string; direction: "up" | "down" | "flat" } {
  if (previous === 0) {
    if (current === 0) return { label: "0%", direction: "flat" };
    return { label: "—", direction: current > 0 ? "up" : "down" };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct) < 0.05 ? 0 : Math.round(pct);
  return {
    label: `${rounded > 0 ? "+" : ""}${rounded}%`,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

function ComparisonRow({
  yesterdayLabel,
  change,
}: {
  yesterdayLabel: string;
  change: { label: string; direction: "up" | "down" | "flat" };
}) {
  const Icon = change.direction === "up" ? ArrowUp : change.direction === "down" ? ArrowDown : Minus;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span>Yesterday: {yesterdayLabel}</span>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          change.direction === "up" && "text-foreground",
          change.direction === "down" && "text-foreground",
          change.direction === "flat" && "text-muted-foreground",
        )}
      >
        <Icon className="h-3 w-3" />
        {change.label}
      </span>
    </p>
  );
}

function HeroKpiCard({
  label,
  value,
  icon: Icon,
  comparison,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  comparison?: ReactNode;
}) {
  return (
    <SurfaceCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-4xl font-semibold leading-none tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {comparison}
        </div>
        <span className="shrink-0 rounded-xl bg-muted/60 p-3 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </SurfaceCard>
  );
}

export function KpiCards({ data, loading }: KpiCardsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 min-[720px]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currency = data.currency ?? "USD";
  const today = data.today;
  const yesterday = data.yesterday ?? { ordersCreatedYesterday: 0, revenueYesterday: "0" };
  const operational = data.operational ?? {
    pendingDispatches: 0,
    activeVehicles: 0,
    workingDrivers: 0,
    invoicesWaiting: 0,
  };

  const ordersChange = percentChange(today.ordersCreatedToday, yesterday.ordersCreatedYesterday);
  const revenueChange = percentChange(
    Number(today.revenueToday),
    Number(yesterday.revenueYesterday),
  );

  const secondaryCards = [
    {
      label: "Vehicles Active",
      value: operational.activeVehicles.toLocaleString(),
      icon: Truck,
    },
    {
      label: "Drivers Working",
      value: operational.workingDrivers.toLocaleString(),
      icon: Users,
    },
    {
      label: "Invoices Waiting",
      value: operational.invoicesWaiting.toLocaleString(),
      icon: FileText,
      note:
        operational.invoicesWaiting > 0
          ? { icon: FileText, text: "Awaiting payment", tone: "neutral" as const }
          : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-3">
        <HeroKpiCard
          label="Today's Orders"
          value={today.ordersCreatedToday.toLocaleString()}
          icon={ClipboardList}
          comparison={
            <ComparisonRow
              yesterdayLabel={yesterday.ordersCreatedYesterday.toLocaleString()}
              change={ordersChange}
            />
          }
        />
        <HeroKpiCard
          label="Today's Revenue"
          value={formatMoney(today.revenueToday, currency)}
          icon={DollarSign}
          comparison={
            <ComparisonRow
              yesterdayLabel={formatMoney(yesterday.revenueYesterday, currency)}
              change={revenueChange}
            />
          }
        />
        <HeroKpiCard
          label="Pending Dispatches"
          value={operational.pendingDispatches.toLocaleString()}
          icon={Truck}
          comparison={
            <p className="mt-3 text-xs text-muted-foreground">
              {operational.pendingDispatches > 0 ? "Awaiting assignment" : "Queue clear"}
            </p>
          }
        />
      </div>

      {/* Three across on a 375px phone left ~110px a tile, which wrapped the
          label onto two lines and cut the note down to "A…". Two across until
          there is room for three, with the odd one out taking the full row. */}
      <div className="grid grid-cols-2 gap-3 opacity-90 min-[720px]:grid-cols-3">
        {secondaryCards.map((card, index) => (
          <div
            key={card.label}
            className={cn(
              index === secondaryCards.length - 1 && secondaryCards.length % 2 === 1
                ? 'col-span-2 min-[720px]:col-span-1'
                : undefined,
            )}
          >
            <MetricCard
              label={card.label}
              value={card.value}
              icon={card.icon}
              size="sm"
              note={card.note}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
