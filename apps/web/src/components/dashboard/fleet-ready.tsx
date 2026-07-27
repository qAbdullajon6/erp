import { Link } from "@tanstack/react-router";
import { AlertTriangle, Phone, Truck } from "lucide-react";
import type { DispatchBoardSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface FleetReadyProps {
  board: DispatchBoardSummary | null;
  loading: boolean;
  canDispatch?: boolean;
}

function licenseNote(expiry: string | null | undefined): { text: string; bad: boolean } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: "Expired", bad: true };
  if (days <= 30) return { text: `${days}d left`, bad: true };
  return {
    text: new Date(expiry).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    bad: false,
  };
}

/// Ready pool — only fields the board actually returns. Hours-today / last
/// assignment are omitted until the API exposes them (no invented metrics).
export function FleetReady({ board, loading, canDispatch }: FleetReadyProps) {
  if (loading) return <Skeleton className="h-56 rounded-xl" />;
  if (!board) {
    return (
      <SurfaceCard className="p-3">
        <p className="text-sm text-muted-foreground">Fleet not available for your role.</p>
      </SurfaceCard>
    );
  }

  const freeDrivers = board.drivers.available;
  const freeVehicles = board.vehicles.available;
  const busyCount = board.drivers.busy.length;
  const onLeave = board.drivers.onLeave.length;

  const ordersPerDriver = new Map<
    string,
    { driver: (typeof board.drivers.busy)[0]["driver"]; count: number; orderId: string }
  >();
  for (const b of board.drivers.busy) {
    const prev = ordersPerDriver.get(b.driver.id);
    if (prev) prev.count += 1;
    else ordersPerDriver.set(b.driver.id, { driver: b.driver, count: 1, orderId: b.currentOrder.id });
  }
  const overloaded = [...ordersPerDriver.values()].filter((d) => d.count > 1);

  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader className="py-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ready to assign</h3>
          <p className="text-[11px] text-muted-foreground">
            {freeDrivers.length} free · {busyCount} busy · {onLeave} leave
          </p>
        </div>
        <span className="rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">
          {freeDrivers.length}d · {freeVehicles.length}v
        </span>
      </SurfaceCardHeader>

      {overloaded.length > 0 && (
        <div className="border-b border-warning/20 bg-warning/5 px-3 py-1.5">
          {overloaded.map(({ driver, count, orderId }) => (
            <div key={driver.id} className="flex items-center gap-2 text-[11px]">
              <AlertTriangle className="h-3 w-3 text-warning" />
              <Link
                to="/app/drivers/$driverId"
                params={{ driverId: driver.id }}
                className="font-medium text-foreground hover:underline"
              >
                {driver.firstName} {driver.lastName}
              </Link>
              <span className="text-warning">{count} jobs</span>
              {driver.phone && (
                <a
                  href={`tel:${driver.phone}`}
                  className="ml-auto text-brand"
                  aria-label={`Call ${driver.firstName}`}
                >
                  <Phone className="h-3 w-3" />
                </a>
              )}
              <Link
                to="/app/orders/$orderId"
                params={{ orderId }}
                className="text-muted-foreground hover:text-brand"
              >
                View
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="max-h-64 overflow-y-auto scrollbar-thin">
          <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Drivers
          </p>
          {freeDrivers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">None free</p>
          ) : (
            freeDrivers.map((d) => {
              const lic = licenseNote(d.licenseExpiry);
              return (
                <div key={d.id} className="flex items-start gap-2 px-3 py-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-[10px] font-bold text-success">
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
                    <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                      <div>
                        <dt className="text-muted-foreground">Load</dt>
                        <dd className="font-medium text-foreground">0 jobs · Idle</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Truck</dt>
                        <dd className="font-medium text-foreground">Unassigned</dd>
                      </div>
                      <div className={cn(lic?.bad && "text-warning")}>
                        <dt className="text-muted-foreground">License</dt>
                        <dd className={cn("font-medium", lic?.bad ? "text-warning" : "text-foreground")}>
                          {lic?.text ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd className="truncate font-medium text-foreground">{d.phone || "—"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Code</dt>
                        <dd className="font-mono text-foreground">{d.employeeCode}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {d.phone && (
                      <a
                        href={`tel:${d.phone}`}
                        aria-label={`Call ${d.firstName}`}
                        className="rounded p-1 text-brand hover:bg-brand/10"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {canDispatch && (
                      <Link
                        to="/app/dispatches/create"
                        className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-brand hover:text-brand"
                      >
                        Use
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="max-h-64 overflow-y-auto scrollbar-thin">
          <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Vehicles
          </p>
          {freeVehicles.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">All in use</p>
          ) : (
            freeVehicles.map((v) => (
              <div key={v.id} className="flex items-start gap-2 px-3 py-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Truck className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/app/vehicles/$vehicleId"
                    params={{ vehicleId: v.id }}
                    className="block truncate font-mono text-[13px] font-semibold text-foreground hover:underline"
                  >
                    {v.plateNumber}
                  </Link>
                  <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                    <div>
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="capitalize text-foreground">
                        {v.type.toLowerCase().replace(/_/g, " ")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Capacity</dt>
                      <dd className="font-medium text-foreground">
                        {v.capacityKg ? `${v.capacityKg} kg` : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Code</dt>
                      <dd className="font-mono text-foreground">{v.vehicleCode}</dd>
                    </div>
                  </dl>
                </div>
                {canDispatch && (
                  <Link
                    to="/app/dispatches/create"
                    className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-brand hover:text-brand"
                  >
                    Use
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
