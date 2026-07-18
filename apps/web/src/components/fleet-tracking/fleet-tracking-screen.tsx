import { useEffect, useState } from "react";
import { FleetMap } from "./fleet-map";
import { VehicleSidebar } from "./vehicle-sidebar";
import { LoadingState, ErrorState } from "@/components/shared/list-states";
import { useLiveFleetQuery, type Vehicle } from "@/lib/api/telematics";

export function FleetTrackingScreen() {
  const { data, isLoading, isError, refetch } = useLiveFleetQuery();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Seed local state from the snapshot; the map's live stream patches it after.
  useEffect(() => {
    if (data) setVehicles(data);
  }, [data]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-border bg-background px-6 py-4">
        <h1 className="font-display text-2xl font-semibold text-foreground">Fleet Tracking</h1>
        <p className="text-sm text-muted-foreground">Real-time GPS tracking and fleet monitoring</p>
      </div>

      {isLoading ? (
        <LoadingState label="Loading live fleet…" />
      ) : isError ? (
        <ErrorState message="Failed to load the live fleet." onRetry={() => void refetch()} />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <VehicleSidebar
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
          />
          <FleetMap
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onVehiclesUpdate={setVehicles}
            onSelectVehicle={setSelectedVehicleId}
          />
        </div>
      )}
    </div>
  );
}
