import { Link } from "@tanstack/react-router";
import { ArrowRight, Phone, Radio, Truck } from "lucide-react";
import type { DispatchBoardSummary } from "@/lib/api/dashboard";
import type { Vehicle as LiveVehicle } from "@/lib/api/telematics";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface LiveDispatchProps {
  board: DispatchBoardSummary | null;
  loading: boolean;
  liveByVehicleId?: Map<string, LiveVehicle>;
}

const STAGE: Record<string, { step: number; label: string }> = {
  ASSIGNED: { step: 1, label: "Assigned" },
  PICKED_UP: { step: 2, label: "Picked up" },
  IN_TRANSIT: { step: 3, label: "In transit" },
  EN_ROUTE_TO_PICKUP: { step: 1, label: "To pickup" },
  AT_PICKUP: { step: 2, label: "At pickup" },
  AT_STOP: { step: 3, label: "At stop" },
  ARRIVED_AT_DELIVERY: { step: 4, label: "Arrived" },
};

function scheduleRisk(deliveryDate: string): { text: string; late: boolean } {
  const hours = (new Date(deliveryDate).getTime() - Date.now()) / 3_600_000;
  if (hours < 0) {
    const d = Math.max(1, Math.floor(-hours / 24));
    return { text: `${d}d late`, late: true };
  }
  if (hours < 24) return { text: `Due ${Math.max(1, Math.round(hours))}h`, late: false };
  return {
    text: `Due ${new Date(deliveryDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`,
    late: false,
  };
}

export function LiveDispatch({ board, loading, liveByVehicleId }: LiveDispatchProps) {
  if (loading) return <Skeleton className="h-48 rounded-xl" />;
  if (!board) {
    return (
      <SurfaceCard className="p-4">
        <p className="text-sm text-muted-foreground">Fleet not available for your role.</p>
      </SurfaceCard>
    );
  }

  const driverByOrderId = new Map(board.drivers.busy.map((d) => [d.currentOrder.id, d.driver]));
  const active = board.vehicles.busy;

  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader className="py-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">On the road</h3>
          <p className="text-[11px] text-muted-foreground">Live fleet</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">
            {active.length}
          </span>
          <Link to="/app/fleet-tracking" className="text-[11px] text-muted-foreground hover:text-brand">
            Map
          </Link>
        </div>
      </SurfaceCardHeader>

      <div className="max-h-72 flex-1 divide-y divide-border/40 overflow-y-auto scrollbar-thin">
        {active.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <Truck className="h-5 w-5 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No vehicles out</p>
          </div>
        )}

        {active.map(({ vehicle, currentOrder }) => {
          const driver = driverByOrderId.get(currentOrder.id);
          const stage = STAGE[currentOrder.status] ?? { step: 1, label: currentOrder.status };
          const risk = scheduleRisk(currentOrder.deliveryDate);
          const live = liveByVehicleId?.get(vehicle.id);
          const gpsAge = live?.lastReceivedAt ? formatRelativeTime(live.lastReceivedAt) : null;
          const isMoving = live?.movementState === "MOVING";

          return (
            <div key={vehicle.id} className="relative px-3 py-2.5">
              {/* Row 1: plate + driver + risk */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/10">
                    <Truck className="h-3 w-3 text-brand" />
                  </span>
                  <span className="font-mono text-[13px] font-bold text-foreground">
                    {vehicle.plateNumber}
                  </span>
                  {driver && (
                    <span className="truncate text-[12px] text-muted-foreground">
                      {driver.firstName} {driver.lastName}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold tabular-nums",
                    risk.late ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {risk.text}
                </span>
              </div>

              {/* Row 2: customer + route */}
              <Link
                to="/app/orders/$orderId"
                params={{ orderId: currentOrder.id }}
                className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {currentOrder.customerName && (
                  <>
                    <span className="truncate font-medium text-foreground/70">
                      {currentOrder.customerName}
                    </span>
                    <span className="text-border">·</span>
                  </>
                )}
                <span className="truncate">{currentOrder.pickupCity}</span>
                <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{currentOrder.deliveryCity}</span>
                {currentOrder.price != null && (
                  <>
                    <span className="text-border">·</span>
                    <span className="tabular-nums">
                      {formatMoney(currentOrder.price, currentOrder.currency ?? "USD")}
                    </span>
                  </>
                )}
              </Link>

              {/* Row 3: stage + GPS + progress */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-1 gap-0.5" aria-label={`Stage: ${stage.label}`}>
                  {[1, 2, 3, 4].map((s) => (
                    <span
                      key={s}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        s <= stage.step ? "bg-brand" : "bg-border/50",
                      )}
                    />
                  ))}
                </div>
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                  {stage.label}
                </span>
                {live?.movementState && live.movementState !== "UNKNOWN" && (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-0.5 text-[10px]",
                      isMoving ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    <Radio className="h-2.5 w-2.5" />
                    {live.speedKph != null ? `${Math.round(live.speedKph)} km/h` : live.movementState.toLowerCase()}
                  </span>
                )}
                {gpsAge && !isMoving && (
                  <span className={cn("shrink-0 text-[10px]", live?.isStale ? "text-warning" : "text-muted-foreground/60")}>
                    GPS {gpsAge}
                  </span>
                )}
              </div>

              {/* Call driver */}
              {driver?.phone && (
                <a
                  href={`tel:${driver.phone}`}
                  aria-label={`Call ${driver.firstName}`}
                  className="absolute right-3 top-3 rounded p-1 text-muted-foreground/40 hover:bg-brand/10 hover:text-brand"
                >
                  <Phone className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}
