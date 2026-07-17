import { Package, AlertTriangle, Clock, UserX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatChip } from "@/components/ui/stat-chip";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface ExecutiveSummaryHeaderProps {
  firstName?: string;
  activeOrders: number | null;
  unassignedOrders: number | null;
  delayedOrders: number | null;
  driversOnLeave: number | null;
  loading: boolean;
}

/// Every number here already existed on data the dashboard was already
/// fetching (ExecutiveOverviewTotals.activeOrders/delayedOrders, and the
/// board's unassignedOrders/onLeave, both previously discarded down to a
/// single count elsewhere or not read at all) — nothing new is computed.
export function ExecutiveSummaryHeader({
  firstName,
  activeOrders,
  unassignedOrders,
  delayedOrders,
  driversOnLeave,
  loading,
}: ExecutiveSummaryHeaderProps) {
  const chips = [
    { label: "Active Shipments", value: activeOrders, icon: Package, tone: "text-brand" },
    { label: "Need Attention", value: unassignedOrders, icon: AlertTriangle, tone: "text-warning" },
    { label: "Delayed", value: delayedOrders, icon: Clock, tone: "text-destructive" },
    { label: "On Leave", value: driversOnLeave, icon: UserX, tone: "text-muted-foreground" },
  ];

  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-muted-foreground">Here's how today's operations look.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-32 rounded-xl" />)
          : chips.map((chip) => (
              <StatChip key={chip.label} label={chip.label} value={chip.value ?? "—"} icon={chip.icon} tone={chip.tone} />
            ))}
      </div>
    </div>
  );
}
