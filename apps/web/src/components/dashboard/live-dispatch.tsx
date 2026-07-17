import { Link } from "@tanstack/react-router";
import { Truck, ArrowRight } from "lucide-react";
import type { DispatchBoardSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/shared/list-states";
import { StatusBadge } from "@/components/shared/status-badge";

interface LiveDispatchProps {
  board: DispatchBoardSummary | null;
  loading: boolean;
}

/// Shows what the dispatch board's own `busy` lists already carry (a
/// vehicle plus the order it's on, and separately a driver plus the same
/// order) — the board endpoint was already returning this; the dashboard
/// just used to throw it away and keep only `.length`. Vehicle and driver
/// are correlated by `currentOrder.id`, since that's the one real key both
/// lists share — no new data, just joining what's already there.
export function LiveDispatch({ board, loading }: LiveDispatchProps) {
  if (loading) {
    return <Skeleton className="h-80 rounded-2xl" />;
  }

  if (!board) {
    return (
      <SurfaceCard className="flex h-full flex-col p-6">
        <SectionHeader title="Live Dispatch" />
        <p className="mt-3 text-sm text-muted-foreground">Fleet status isn't available for your role.</p>
      </SurfaceCard>
    );
  }

  const driverByOrderId = new Map(board.drivers.busy.map((d) => [d.currentOrder.id, d.driver]));
  const active = board.vehicles.busy;

  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader>
        <SectionHeader title="Live Dispatch" subtitle="Vehicles on the road right now" />
        <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">{active.length}</span>
      </SurfaceCardHeader>

      <div className="max-h-80 flex-1 divide-y divide-brand/10 overflow-y-auto scrollbar-thin">
        {active.length === 0 && (
          <EmptyState icon={Truck} title="No vehicle is out on a trip right now" />
        )}

        {active.map(({ vehicle, currentOrder }) => {
          const driver = driverByOrderId.get(currentOrder.id);
          return (
            <Link
              key={vehicle.id}
              to="/app/orders/$orderId"
              params={{ orderId: currentOrder.id }}
              className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-background/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Truck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate">
                  <span className="truncate font-mono text-sm font-semibold text-foreground">
                    {vehicle.plateNumber}
                  </span>
                  {driver ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {driver.firstName} {driver.lastName}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className="truncate">{currentOrder.pickupCity}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                  <span className="truncate">{currentOrder.deliveryCity}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={currentOrder.status} />
                <span className="font-mono text-xs text-muted-foreground">{currentOrder.orderNumber}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </SurfaceCard>
  );
}
