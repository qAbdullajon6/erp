import type { DispatchBoardSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface DriverFleetStatusProps {
  board: DispatchBoardSummary | null;
  loading: boolean;
}

export function DriverFleetStatus({ board, loading }: DriverFleetStatusProps) {
  if (loading) {
    return <Skeleton className="h-56 rounded-2xl" />;
  }

  if (!board) {
    return (
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
        <h3 className="font-display text-lg font-bold text-foreground">Fleet Status</h3>
        <p className="mt-3 text-sm text-muted-foreground">Fleet status isn't available for your role.</p>
      </div>
    );
  }

  const driversAvailable = board.drivers.available.length;
  const driversBusy = board.drivers.busy.length;
  const driversOnLeave = (board.drivers.onLeave as unknown[] | undefined)?.length ?? 0;
  const totalDrivers = driversAvailable + driversBusy + driversOnLeave;

  const vehiclesAvailable = board.vehicles.available.length;
  const vehiclesBusy = board.vehicles.busy.length;
  const vehiclesMaintenance = (board.vehicles.maintenance as unknown[] | undefined)?.length ?? 0;
  const totalVehicles = vehiclesAvailable + vehiclesBusy + vehiclesMaintenance;

  const fleet = [
    { label: "Drivers available", count: driversAvailable, total: totalDrivers, color: "bg-success" },
    { label: "Drivers busy", count: driversBusy, total: totalDrivers, color: "bg-brand" },
    { label: "Vehicles available", count: vehiclesAvailable, total: totalVehicles, color: "bg-success" },
    { label: "Vehicles in maintenance", count: vehiclesMaintenance, total: totalVehicles, color: "bg-warning" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
      <h3 className="font-display text-lg font-bold text-foreground">Fleet Status</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {totalDrivers} drivers · {totalVehicles} vehicles
      </p>
      <div className="mt-6 space-y-4">
        {fleet.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.color} text-white`}>
                {item.count}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
              <div
                className={`h-full ${item.color}`}
                style={{ width: item.total > 0 ? `${(item.count / item.total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
