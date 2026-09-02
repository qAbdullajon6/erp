import { useEffect, useRef } from 'react';
import type { ApiRouteStop } from '@/lib/api/routes';
import { isMapboxPublicTokenConfigured, MAPBOX_PUBLIC_TOKEN, mapboxStyleUrl } from '@/lib/mapbox';
import { MapPin } from 'lucide-react';

export interface VehiclePosition {
  lat: number;
  lng: number;
  heading?: number | null;
}

interface RouteMapProps {
  stops: ApiRouteStop[];
  vehiclePosition?: VehiclePosition | null;
  currentStopSequence?: number | null;
  geometry?: string | null;
}

export function RouteMap({ stops, vehiclePosition, currentStopSequence, geometry }: RouteMapProps) {
  const stopsWithCoords = stops.filter((s) => s.lat != null && s.lng != null);
  const hasToken = isMapboxPublicTokenConfigured();

  if (!hasToken) {
    return <MapPlaceholder reason="no-token" />;
  }

  if (stopsWithCoords.length === 0) {
    return <MapPlaceholder reason="no-coords" />;
  }

  // Include stop sequence order in the key so the map remounts when optimization
  // reorders stops (geometry may not change until the async recalculation completes).
  const seqKey = stopsWithCoords.map((s) => s.sequence).join(',');

  return (
    <MapboxRouteMap
      key={`${geometry ?? ''}|${seqKey}`}
      stops={stopsWithCoords}
      vehiclePosition={vehiclePosition}
      currentStopSequence={currentStopSequence}
      geometry={geometry}
    />
  );
}

function MapPlaceholder({ reason }: { reason: 'no-token' | 'no-coords' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/10 py-10 text-center">
      <div className="rounded-full bg-muted p-3">
        <MapPin className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {reason === 'no-token' ? 'Map not configured' : 'No stop coordinates'}
      </p>
      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
        {reason === 'no-token'
          ? 'Add VITE_MAPBOX_ACCESS_TOKEN to .env.local to enable the route map.'
          : 'Stops with coordinates will appear here once geocoded.'}
      </p>
    </div>
  );
}

function MapboxRouteMap({
  stops,
  vehiclePosition,
  currentStopSequence,
  geometry,
}: {
  stops: ApiRouteStop[];
  vehiclePosition?: VehiclePosition | null;
  currentStopSequence?: number | null;
  geometry?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const mapLoadedRef = useRef(false);
  const vehicleMarkerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      import('mapbox-gl/dist/mapbox-gl.css');
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;

      const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
      const stopCoords = ordered.map((s) => [Number(s.lng), Number(s.lat)] as [number, number]);

      // Prefer stored routing geometry; fall back to straight-line between stops
      let routeLineCoords: [number, number][];
      try {
        routeLineCoords = geometry ? (JSON.parse(geometry) as [number, number][]) : stopCoords;
      } catch {
        routeLineCoords = stopCoords;
      }

      const allCoords = routeLineCoords.length > 0 ? routeLineCoords : stopCoords;

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: mapboxStyleUrl(),
        bounds:
          allCoords.length > 1
            ? [
                [Math.min(...allCoords.map((c) => c[0])) - 0.02, Math.min(...allCoords.map((c) => c[1])) - 0.02],
                [Math.max(...allCoords.map((c) => c[0])) + 0.02, Math.max(...allCoords.map((c) => c[1])) + 0.02],
              ]
            : undefined,
        center: allCoords.length === 1 ? allCoords[0] : undefined,
        zoom: allCoords.length === 1 ? 13 : undefined,
      });

      mapRef.current = map;

      map.on('load', () => {
        mapLoadedRef.current = true;

        // Route line — uses real routing geometry when available, dashed straight-line otherwise
        if (routeLineCoords.length > 1) {
          const isRealGeometry = Boolean(geometry);
          map.addSource('route-line', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: routeLineCoords },
              properties: {},
            },
          });
          map.addLayer({
            id: 'route-line-layer',
            type: 'line',
            source: 'route-line',
            paint: {
              'line-color': '#f59e0b',
              'line-width': isRealGeometry ? 4 : 3,
              ...(isRealGeometry ? {} : { 'line-dasharray': [2, 1] }),
            },
          });
        }

        // Stop markers
        ordered.forEach((stop, idx) => {
          const isCurrent = currentStopSequence != null && stop.sequence === currentStopSequence;
          const el = document.createElement('div');
          el.className = 'route-stop-marker';
          el.style.cssText = [
            'width:28px', 'height:28px', 'border-radius:50%',
            `background:${isCurrent ? '#3b82f6' : '#f59e0b'}`,
            `border:${isCurrent ? '3px solid #fff' : '2.5px solid #fff'}`,
            'box-shadow:0 1px 4px rgba(0,0,0,.35)',
            'display:flex', 'align-items:center', 'justify-content:center',
            'font-size:11px', 'font-weight:700', 'color:#fff',
            'cursor:default', 'user-select:none',
          ].join(';');
          el.textContent = String(idx + 1);
          el.title = `${stop.label ?? stop.city}: ${stop.address}`;

          new mapboxgl.Marker({ element: el })
            .setLngLat([Number(stop.lng), Number(stop.lat)])
            .setPopup(
              new mapboxgl.Popup({ offset: 18 }).setHTML(
                `<strong>#${stop.sequence} ${stop.label ?? stop.city}</strong><br/>${stop.address}`,
              ),
            )
            .addTo(map);
        });
      });
    });

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        mapLoadedRef.current = false;
        vehicleMarkerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update vehicle marker whenever live position changes
  useEffect(() => {
    if (!vehiclePosition || !mapLoadedRef.current) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any;
      if (!map) return;

      const lngLat: [number, number] = [vehiclePosition.lng, vehiclePosition.lat];

      if (vehicleMarkerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vehicleMarkerRef.current as any).setLngLat(lngLat);
      } else {
        const el = document.createElement('div');
        el.style.cssText = [
          'width:20px', 'height:20px', 'border-radius:50%',
          'background:#3b82f6', 'border:3px solid #fff',
          'box-shadow:0 0 0 3px rgba(59,130,246,.35),0 2px 6px rgba(0,0,0,.4)',
          'cursor:default',
        ].join(';');
        el.title = 'Driver position';

        vehicleMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat)
          .addTo(map);
      }
    });
  }, [vehiclePosition]);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full overflow-hidden rounded-xl"
      aria-label="Route map"
      role="img"
    />
  );
}
