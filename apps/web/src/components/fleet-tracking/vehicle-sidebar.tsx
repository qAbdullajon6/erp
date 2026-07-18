import { useState } from "react";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Search, Circle, Navigation, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Vehicle } from "./types";

interface VehicleSidebarProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
}

export function VehicleSidebar({ vehicles, selectedVehicleId, onSelectVehicle }: VehicleSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = vehicles.filter((v) => {
    const matchesSearch =
      !searchQuery ||
      v.vehicleCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.plateNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.driverName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = !statusFilter || v.movementState === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusCounts = vehicles.reduce((acc, v) => {
    acc[v.movementState] = (acc[v.movementState] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex w-80 flex-col border-r bg-background">
      <div className="border-b p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vehicles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex gap-2 border-b p-4">
        <StatusFilterBadge
          label="All"
          count={vehicles.length}
          active={statusFilter === null}
          onClick={() => setStatusFilter(null)}
        />
        <StatusFilterBadge
          label="Moving"
          count={statusCounts["MOVING"] || 0}
          color="green"
          active={statusFilter === "MOVING"}
          onClick={() => setStatusFilter("MOVING")}
        />
        <StatusFilterBadge
          label="Idle"
          count={statusCounts["IDLING"] || 0}
          color="amber"
          active={statusFilter === "IDLING"}
          onClick={() => setStatusFilter("IDLING")}
        />
        <StatusFilterBadge
          label="Stopped"
          count={statusCounts["STOPPED"] || 0}
          color="indigo"
          active={statusFilter === "STOPPED"}
          onClick={() => setStatusFilter("STOPPED")}
        />
        <StatusFilterBadge
          label="Offline"
          count={statusCounts["OFFLINE"] || 0}
          color="red"
          active={statusFilter === "OFFLINE"}
          onClick={() => setStatusFilter("OFFLINE")}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No vehicles found
            </div>
          )}

          {filtered.map((vehicle) => (
            <button
              key={vehicle.vehicleId}
              onClick={() => onSelectVehicle(vehicle.vehicleId)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                selectedVehicleId === vehicle.vehicleId && "border-primary bg-accent"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Circle
                      className={cn("h-2 w-2 fill-current", getStatusColor(vehicle.movementState))}
                    />
                    <span className="font-medium">
                      {vehicle.vehicleCode || vehicle.plateNumber || "Unknown Vehicle"}
                    </span>
                  </div>

                  {vehicle.driverName && (
                    <div className="text-sm text-muted-foreground">{vehicle.driverName}</div>
                  )}

                  {vehicle.speedKph !== null && vehicle.movementState === "MOVING" && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Navigation className="h-3 w-3" />
                      {Math.round(vehicle.speedKph)} km/h
                    </div>
                  )}

                  {vehicle.lastRecordedAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(vehicle.lastRecordedAt)}
                    </div>
                  )}
                </div>

                <Badge variant={vehicle.isStale ? "destructive" : "secondary"} className="text-xs">
                  {vehicle.movementState}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface StatusFilterBadgeProps {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}

/// The dot colours mirror the map markers and the row status colours in this
/// same file (getStatusColor), so a status reads identically across the sidebar
/// filters, the vehicle rows, and the map pins.
const FILTER_DOT_COLOR: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  indigo: "bg-indigo-500",
  red: "bg-red-500",
};

function StatusFilterBadge({ label, count, color, active, onClick }: StatusFilterBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
      )}
    >
      {color && <span className={cn("h-2 w-2 rounded-full", FILTER_DOT_COLOR[color])} aria-hidden />}
      {label} ({count})
    </button>
  );
}

function getStatusColor(state: Vehicle["movementState"]): string {
  switch (state) {
    case "MOVING":
      return "text-green-500";
    case "IDLING":
      return "text-amber-500";
    case "STOPPED":
      return "text-indigo-500";
    case "OFFLINE":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}
