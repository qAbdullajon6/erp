import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize2 } from "lucide-react";
import { Button } from "../ui/button";
import { telematicsAPI } from "@/lib/api/telematics";
import type { Vehicle } from "./types";

/// FlowERP is a single dark-first theme (see design tokens in styles.css), so
/// the map uses one dark raster style rather than switching on a theme hook the
/// app does not have.
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-opacity": 0.6,
        "raster-brightness-min": 0,
        "raster-brightness-max": 0.5,
        "raster-contrast": 0.3,
      },
    },
  ],
};

interface FleetMapProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  /// The parent's `setVehicles` — accepts an updater fn, which the live stream
  /// uses to patch a single vehicle without re-reading the whole list.
  onVehiclesUpdate: Dispatch<SetStateAction<Vehicle[]>>;
  onSelectVehicle: (vehicleId: string | null) => void;
}

export function FleetMap({ vehicles, selectedVehicleId, onVehiclesUpdate, onSelectVehicle }: FleetMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Initialize map once.
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const instance = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: [-74.006, 40.7128], // NYC default until the fleet snapshot recenters
      zoom: 10,
    });
    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    instance.addControl(new maplibregl.ScaleControl(), "bottom-left");
    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // Subscribe to the live SSE stream and patch vehicles as state events arrive.
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        for await (const event of telematicsAPI.streamLive(controller.signal)) {
          if (event.type !== "state" || !event.vehicleId) continue;
          const vehicleId = event.vehicleId;
          onVehiclesUpdate((prev) =>
            prev.map((v) =>
              v.vehicleId === vehicleId
                ? {
                    ...v,
                    latitude: event.payload.latitude,
                    longitude: event.payload.longitude,
                    speedKph: event.payload.speedKph,
                    heading: event.payload.heading,
                    movementState: event.payload.movementState,
                  }
                : v,
            ),
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Telematics live stream error:", err);
        }
      }
    })();

    return () => controller.abort();
  }, [onVehiclesUpdate]);

  // Reconcile markers whenever the vehicle list changes.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    vehicles.forEach((vehicle) => {
      if (vehicle.latitude === null || vehicle.longitude === null) return;

      const existing = markers.current.get(vehicle.vehicleId);
      if (!existing) {
        const el = document.createElement("div");
        el.className = "vehicle-marker";
        el.style.width = "32px";
        el.style.height = "32px";
        el.style.cursor = "pointer";
        el.innerHTML = getMarkerSVG(vehicle);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([vehicle.longitude, vehicle.latitude])
          .addTo(mapInstance);
        marker.getElement().addEventListener("click", () => onSelectVehicle(vehicle.vehicleId));
        markers.current.set(vehicle.vehicleId, marker);
      } else {
        existing.setLngLat([vehicle.longitude, vehicle.latitude]);
        existing.getElement().innerHTML = getMarkerSVG(vehicle);
      }
    });

    // Drop markers for vehicles no longer present.
    markers.current.forEach((marker, vehicleId) => {
      if (!vehicles.some((v) => v.vehicleId === vehicleId)) {
        marker.remove();
        markers.current.delete(vehicleId);
      }
    });
  }, [vehicles, onSelectVehicle]);

  // Fly to the selected vehicle.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !selectedVehicleId) return;

    const vehicle = vehicles.find((v) => v.vehicleId === selectedVehicleId);
    if (vehicle && vehicle.latitude !== null && vehicle.longitude !== null) {
      mapInstance.flyTo({ center: [vehicle.longitude, vehicle.latitude], zoom: 15, duration: 1000 });
    }
  }, [selectedVehicleId, vehicles]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void mapContainer.current?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <div className="relative flex-1">
      <div ref={mapContainer} className="h-full w-full" />
      <div className="absolute right-4 top-4 flex gap-2">
        <Button variant="secondary" size="icon" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function getMarkerSVG(vehicle: Vehicle): string {
  const color = getVehicleColor(vehicle.movementState);
  const rotation = vehicle.heading ?? 0;

  return `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${rotation}deg)">
      <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.3" />
      <circle cx="16" cy="16" r="8" fill="${color}" stroke="white" stroke-width="2" />
      <path d="M16 8 L20 14 L16 12 L12 14 Z" fill="white" />
    </svg>
  `;
}

function getVehicleColor(state: Vehicle["movementState"]): string {
  switch (state) {
    case "MOVING":
      return "#10b981"; // green
    case "IDLING":
      return "#f59e0b"; // amber
    case "STOPPED":
      return "#6366f1"; // indigo
    case "OFFLINE":
      return "#ef4444"; // red
    default:
      return "#9ca3af"; // gray
  }
}
