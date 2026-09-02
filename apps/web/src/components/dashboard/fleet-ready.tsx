import { Link } from "@tanstack/react-router";
import { AlertTriangle, Phone, Truck } from "lucide-react";
import type { DispatchBoardSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";

interface FleetReadyProps {
  board: DispatchBoardSummary | null;
  loading: boolean;
  canDispatch?: boolean;
}

function licenseWarning(expiry: string | null | undefined): string | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "License expired";
  if (days <= 30) return `License ${days}d`;
  return null;
}

/// Ready pool — compact scannable rows, not a detailed data table.
export function FleetReady({ board, loading, canDispatch }: FleetReadyProps) {
  if (loading) return <Skeleton className="h-48 rounded-xl" />;
  if (!board) {
    return (
      <SurfaceCard className="p-4">
        <p className="text-sm text-muted-foreground">Fleet not available for your role.</p>
      </SurfaceCard>
    );
  }

  const freeDrivers = board.drivers.available;
  const freeVehicles = board.vehicles.available;
  const busyCount = board.drivers.busy.length;
  const onLeave = board.drivers.onLeave.length;

  const overloaded = (() => {
    const counts = new Map<string, { driver: (typeof board.drivers.busy)[0]["driver"]; orderId: string }>();
    for (const b of board.drivers.busy) {
      if (!counts.has(b.driver.id)) counts.set(b.driver.id, { driver: b.driver, orderId: b.currentOrder.id });
    }
    const dupes = new Map<string, number>();
    for (const b of board.drivers.busy) {
      dupes.set(b.driver.id, (dupes.get(b.driver.id) ?? 0) + 1);
    }
    return [...dupes.entries()]
      .filter(([, n]) => n > 1)
      .map(([id]) => counts.get(id)!)
      .filter(Boolean);
  })();

  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader className="py-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ready to assign</h3>
          <p className="text-[11px] text-muted-foreground">
            {freeDrivers.length} free · {busyCount} busy
            {onLeave > 0 ? ` · ${onLeave} leave` : ""}
          </p>
        </div>
        <span className="rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">
          {freeDrivers.length}d · {freeVehicles.length}v
        </span>
      </SurfaceCardHeader>

      {overloaded.length > 0 && (
        <div className="border-b border-warning/15 bg-warning/5 px-3 py-1.5">
          {overloaded.map(({ driver, orderId }) => (
            <div key={driver.id} className="flex items-center gap-2 text-[11px]">
              <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
              <Link
                to="/app/drivers/$driverId"
                params={{ driverId: driver.id }}
                className="font-medium text-foreground hover:underline"
              >
                {driver.firstName} {driver.lastName}
              </Link>
              <span className="text-warning">overloaded</span>
              <Link
                to="/app/orders/$orderId"
                params={{ orderId }}
                className="ml-auto text-[10px] text-muted-foreground hover:text-brand"
              >
                View
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 divide-y divide-border/50 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {/* Drivers */}
        <div className="overflow-y-auto scrollbar-thin">
          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Drivers
          </p>
          {freeDrivers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">None free</p>
          ) : (
            <ul className="pb-1">
              {freeDrivers.map((d) => {
                const warn = licenseWarning(d.licenseExpiry);
                return (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-[10px] font-bold text-success">
                      {(d.firstName[0] ?? "") + (d.lastName[0] ?? "")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/drivers/$driverId"
                        params={{ driverId: d.id }}
                        className="block truncate text-[13px] font-medium text-foreground hover:underline"
                      >
                        {d.firstName} {d.lastName}
                      </Link>
                      {warn ? (
                        <p className="text-[10px] font-medium text-warning">{warn}</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">{d.employeeCode}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {d.phone && (
                        <a
                          href={`tel:${d.phone}`}
                          aria-label={`Call ${d.firstName}`}
                          className="rounded p-1 text-muted-foreground hover:bg-brand/10 hover:text-brand"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {canDispatch && (
                        <Link
                          to="/app/dispatches/create"
                          className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-brand/40 hover:text-brand"
                        >
                          Use
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Vehicles */}
        <div className="overflow-y-auto scrollbar-thin">
          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Vehicles
          </p>
          {freeVehicles.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">All in use</p>
          ) : (
            <ul className="pb-1">
              {freeVehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/app/vehicles/$vehicleId"
                      params={{ vehicleId: v.id }}
                      className="block truncate font-mono text-[13px] font-semibold text-foreground hover:underline"
                    >
                      {v.plateNumber}
                    </Link>
                    <p className="truncate text-[10px] capitalize text-muted-foreground">
                      {v.type.toLowerCase().replace(/_/g, " ")}
                      {v.capacityKg ? ` · ${v.capacityKg} kg` : ""}
                    </p>
                  </div>
                  {canDispatch && (
                    <Link
                      to="/app/dispatches/create"
                      className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-brand/40 hover:text-brand"
                    >
                      Use
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
