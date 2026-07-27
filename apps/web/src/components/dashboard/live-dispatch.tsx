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
  /// Optional live telematics keyed by vehicleId — speed, GPS age, movement.
  liveByVehicleId?: Map<string, LiveVehicle>;
}

const STAGE: Record<string, { step: number; label: string }> = {
  ASSIGNED: { step: 1, label: "Assigned" },
  PICKED_UP: { step: 2, label: "Picked up" },
  IN_TRANSIT: { step: 3, label: "In transit" },
  EN_ROUTE_TO_PICKUP: { step: 1, label: "To pickup" },
  AT_PICKUP: { step: 2, label: "At pickup" },
};

function scheduleRisk(deliveryDate: string): { text: string; late: boolean } {
  const hours = (new Date(deliveryDate).getTime() - Date.now()) / 3_600_000;
  if (hours < 0) {
    return { text: `${Math.max(1, Math.floor(-hours / 24))}d late`, late: true };
  }
  if (hours < 24) return { text: `Due ${Math.max(1, Math.round(hours))}h`, late: false };
  return {
    text: `Due ${new Date(deliveryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    late: false,
  };
}

export function LiveDispatch({ board, loading, liveByVehicleId }: LiveDispatchProps) {
  if (loading) return <Skeleton className="h-56 rounded-xl" />;
  if (!board) {
    return (
      <SurfaceCard className="p-3">
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
          <p className="text-[11px] text-muted-foreground">Live fleet · GPS when available</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-brand">
            {active.length}
          </span>
          <Link to="/app/fleet-tracking" className="text-[11px] font-medium text-brand hover:underline">
            Map
          </Link>
        </div>
      </SurfaceCardHeader>

      <div className="max-h-64 flex-1 divide-y divide-border/60 overflow-y-auto scrollbar-thin">
        {active.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No vehicles out</p>
          </div>
        )}

        {active.map(({ vehicle, currentOrder }) => {
          const driver = driverByOrderId.get(currentOrder.id);
          const stage = STAGE[currentOrder.status] ?? { step: 1, label: currentOrder.status };
          const risk = scheduleRisk(currentOrder.deliveryDate);
          const live = liveByVehicleId?.get(vehicle.id);
          const gpsAge = live?.lastReceivedAt ? formatRelativeTime(live.lastReceivedAt) : null;

          return (
            <div key={vehicle.id} className="flex items-start gap-2 px-3 py-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                <Truck className="h-3 w-3" />
              </span>
              <Link
                to="/app/orders/$orderId"
                params={{ orderId: currentOrder.id }}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
                  <span className="font-mono font-semibold">{vehicle.plateNumber}</span>
                  {driver && (
                    <span className="truncate text-muted-foreground">
                      {driver.firstName} {driver.lastName}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                  {currentOrder.customerName && <span className="truncate">{currentOrder.customerName}</span>}
                  <span className="inline-flex items-center gap-0.5">
                    {currentOrder.pickupCity}
                    <ArrowRight className="h-2.5 w-2.5" />
                    {currentOrder.deliveryCity}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                  <span>
                    Stop: <span className="font-medium text-foreground">{stage.label}</span>
                  </span>
                  <span className={cn(risk.late && "font-semibold text-destructive")}>
                    {risk.late ? "Late" : "Remaining"}: {risk.text}
                  </span>
                  {live?.movementState && live.movementState !== "UNKNOWN" && (
                    <span className="inline-flex items-center gap-0.5 capitalize">
                      <Radio className="h-2.5 w-2.5" />
                      {live.movementState.toLowerCase()}
                    </span>
                  )}
                  {live?.speedKph != null && <span>{Math.round(live.speedKph)} km/h</span>}
                  {gpsAge && (
                    <span className={cn(live?.isStale && "text-warning")}>GPS {gpsAge}</span>
                  )}
                  {currentOrder.price != null && (
                    <span className="tabular-nums">
                      {formatMoney(currentOrder.price, currentOrder.currency ?? "USD")}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-0.5" aria-label={`Stage: ${stage.label}`}>
                  {[1, 2, 3, 4].map((s) => (
                    <span
                      key={s}
                      className={cn("h-1 flex-1 rounded-full", s <= stage.step ? "bg-brand" : "bg-border")}
                    />
                  ))}
                </div>
              </Link>
              {driver?.phone && (
                <a
                  href={`tel:${driver.phone}`}
                  aria-label={`Call ${driver.firstName}`}
                  className="rounded p-1 text-brand hover:bg-brand/10"
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
