'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Link } from '@tanstack/react-router';
import { ExternalLink, MapPin } from 'lucide-react';
import {
  isMapboxPublicTokenConfigured,
  MAPBOX_PUBLIC_TOKEN,
  mapboxStyleUrl,
} from '@/lib/mapbox';
import { cn } from '@/lib/utils';

interface OrderRouteMapProps {
  pickupCity: string;
  pickupCountryCode?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryCity: string;
  deliveryCountryCode?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  vehicleId?: string | null;
  className?: string;
}

type Coords = { lat: number; lng: number };

async function geocodeCity(city: string, countryCode?: string | null): Promise<Coords | null> {
  const q = encodeURIComponent(`${city}${countryCode ? `, ${countryCode}` : ''}`);
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_PUBLIC_TOKEN}&limit=1&types=place,locality,region`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry: { coordinates: [number, number] } }>;
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return { lat: coords[1], lng: coords[0] };
  } catch {
    return null;
  }
}

// Returns road-following route coordinates from Mapbox Directions API.
// Falls back to a straight line if the API call fails or returns no route.
async function getRouteCoords(
  pickup: Coords,
  delivery: Coords,
): Promise<[number, number][]> {
  const straightLine: [number, number][] = [
    [pickup.lng, pickup.lat],
    [delivery.lng, delivery.lat],
  ];
  try {
    const coords = `${pickup.lng},${pickup.lat};${delivery.lng},${delivery.lat}`;
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_PUBLIC_TOKEN}`,
    );
    if (!res.ok) return straightLine;
    const data = (await res.json()) as {
      routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
    };
    const routeCoords = data.routes?.[0]?.geometry?.coordinates;
    if (!routeCoords || routeCoords.length < 2) return straightLine;
    return routeCoords;
  } catch {
    return straightLine;
  }
}

function createMarkerEl(color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);`;
  return el;
}

export function OrderRouteMap(props: OrderRouteMapProps) {
  if (!isMapboxPublicTokenConfigured()) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-muted/10 text-center',
          props.className,
        )}
      >
        <div className="rounded-full bg-muted p-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-2 text-sm font-medium text-foreground">Map not configured</p>
        <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
          Add VITE_MAPBOX_ACCESS_TOKEN to .env.local to enable route maps
        </p>
      </div>
    );
  }

  return <OrderRouteMapGL {...props} />;
}

function OrderRouteMapGL({
  pickupCity,
  pickupCountryCode,
  pickupLat,
  pickupLng,
  deliveryCity,
  deliveryCountryCode,
  deliveryLat,
  deliveryLng,
  vehicleId,
  className,
}: OrderRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geocodeError, setGeocodeError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: mapboxgl.Map | null = null;
    let cancelled = false;

    void (async () => {
      // Use stored coordinates when available — skip geocoding (which only
      // resolves to the city centre, not the actual address pin).
      let pickup: Coords | null =
        pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null;
      let delivery: Coords | null =
        deliveryLat != null && deliveryLng != null ? { lat: deliveryLat, lng: deliveryLng } : null;

      // Only geocode what's still missing.
      if (!pickup || !delivery) {
        const [gc1, gc2] = await Promise.all([
          pickup ? Promise.resolve(pickup) : geocodeCity(pickupCity, pickupCountryCode),
          delivery ? Promise.resolve(delivery) : geocodeCity(deliveryCity, deliveryCountryCode),
        ]);
        pickup = gc1;
        delivery = gc2;
      }

      if (cancelled) return;

      if (!pickup || !delivery) {
        setGeocodeError(true);
        return;
      }

      // Fetch road-following route; falls back to straight line automatically.
      const routeCoords = await getRouteCoords(pickup, delivery);
      if (cancelled) return;

      map = new mapboxgl.Map({
        container,
        style: mapboxStyleUrl('dark'),
        accessToken: MAPBOX_PUBLIC_TOKEN,
        center: [(pickup.lng + delivery.lng) / 2, (pickup.lat + delivery.lat) / 2],
        zoom: 4,
        attributionControl: false,
        logoPosition: 'bottom-left',
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        if (cancelled || !map) return;

        map.addSource('order-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: routeCoords,
            },
            properties: {},
          },
        });

        // Casing — dark outline for contrast on light map areas
        map.addLayer({
          id: 'order-route-line-casing',
          type: 'line',
          source: 'order-route',
          paint: {
            'line-color': '#000',
            'line-width': 5,
            'line-opacity': 0.3,
          },
        });

        map.addLayer({
          id: 'order-route-line',
          type: 'line',
          source: 'order-route',
          paint: {
            'line-color': '#f97316',
            'line-width': 3,
          },
        });

        new mapboxgl.Marker({ element: createMarkerEl('#22c55e') })
          .setLngLat([pickup.lng, pickup.lat])
          .addTo(map);

        new mapboxgl.Marker({ element: createMarkerEl('#ef4444') })
          .setLngLat([delivery.lng, delivery.lat])
          .addTo(map);

        // Fit bounds around the actual route, not just the two endpoints
        const lngs = routeCoords.map((c) => c[0]);
        const lats = routeCoords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 50, maxZoom: 10, duration: 0 },
        );
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pickupCity, pickupCountryCode, pickupLat, pickupLng, deliveryCity, deliveryCountryCode, deliveryLat, deliveryLng]);

  if (geocodeError) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-muted/10 text-center',
          className,
        )}
      >
        <div className="rounded-full bg-muted p-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Could not locate cities on map</p>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div ref={containerRef} className="w-full h-full" />
      <Link
        to="/app/fleet-tracking"
        search={vehicleId ? { vehicleId } : {}}
        className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-sm bg-black/70 px-3 py-2 text-[13px] font-medium text-white hover:bg-black/90"
      >
        <ExternalLink className="h-3 w-3" />
        Open in map
      </Link>
    </div>
  );
}
