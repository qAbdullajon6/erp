import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  DollarSign,
  FileText,
  Truck,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/lib/api/dashboard";

interface KpiCardsProps {
  data: DashboardSummary | null;
  loading: boolean;
}

function percentChange(
  current: number,
  previous: number,
): { label: string; direction: "up" | "down" | "flat" } {
  if (previous === 0) {
    if (current === 0) return { label: "—", direction: "flat" };
    return { label: "new", direction: "up" };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct) < 0.05 ? 0 : Math.round(pct);
  return {
    label: `${rounded > 0 ? "+" : ""}${rounded}%`,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

interface KpiTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Supporting context line below the value */
  sub?: string;
  /** Yesterday comparison delta */
  delta?: { label: string; direction: "up" | "down" | "flat" };
  /** Emphasise this tile: larger value, higher visual weight */
  primary?: boolean;
  /** Warn state: amber border when non-zero */
  warn?: boolean;
}

function KpiTile({ label, value, icon: Icon, sub, delta, primary, warn }: KpiTileProps) {
  const DeltaIcon = delta?.direction === "up" ? ArrowUp : delta?.direction === "down" ? ArrowDown : null;

  return (
    <SurfaceCard
      className={cn(
        "px-4 py-3.5",
        warn && "border-warning/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground/80">{label}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/25" />
      </div>
      <p
        className={cn(
          "mt-2 font-semibold leading-none tabular-nums text-foreground",
          primary ? "text-2xl" : "text-xl",
        )}
      >
        {value}
      </p>
      {(sub || delta) && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {delta && DeltaIcon ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums",
                delta.direction === "up" && "text-success",
                delta.direction === "down" && "text-destructive/70",
              )}
            >
              <DeltaIcon className="h-2.5 w-2.5" />
              {delta.label}
            </span>
          ) : delta ? (
            <span className="tabular-nums text-muted-foreground">{delta.label}</span>
          ) : null}
          {sub && (
            <span className={cn("truncate", delta && "text-muted-foreground/60")}>
              {sub}
            </span>
          )}
        </div>
      )}
    </SurfaceCard>
  );
}

export function KpiCards({ data, loading }: KpiCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-2xl" />
        ))}
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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Today's Orders"
        value={today.ordersCreatedToday.toLocaleString()}
        icon={ClipboardList}
        sub={`yday ${yesterday.ordersCreatedYesterday}`}
        delta={ordersChange}
        primary
      />
      <KpiTile
        label="Today's Revenue"
        value={formatMoney(today.revenueToday, currency)}
        icon={DollarSign}
        sub={`yday ${formatMoney(yesterday.revenueYesterday, currency)}`}
        delta={revenueChange}
        primary
      />
      <KpiTile
        label="Pending Dispatches"
        value={operational.pendingDispatches.toLocaleString()}
        icon={Truck}
        sub={operational.pendingDispatches > 0 ? "Need assignment" : "Queue clear"}
      />
      <KpiTile
        label="Vehicles Active"
        value={operational.activeVehicles.toLocaleString()}
        icon={Truck}
      />
      <KpiTile
        label="Drivers Working"
        value={operational.workingDrivers.toLocaleString()}
        icon={Users}
      />
      <KpiTile
        label="Invoices Waiting"
        value={operational.invoicesWaiting.toLocaleString()}
        icon={FileText}
        sub={operational.invoicesWaiting > 0 ? "Awaiting payment" : undefined}
        warn={operational.invoicesWaiting > 0}
      />
    </div>
  );
}
