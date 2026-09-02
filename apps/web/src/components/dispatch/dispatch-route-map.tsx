'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_PUBLIC_TOKEN,
  isMapboxPublicTokenConfigured,
  mapboxStyleUrl,
} from '@/lib/mapbox';
import { useDirectionsQuery } from '@/lib/api/tracking-map';
import type { DirectionsResult } from '@/lib/api/tracking-map';
import { cn } from '@/lib/utils';
import { MapPin } from 'lucide-react';

interface DispatchRouteMapProps {
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  liveLat?: number | null;
  liveLng?: number | null;
  onDirections?: (result: DirectionsResult) => void;
  className?: string;
}

export function DispatchRouteMap({
  pickupLat,
  pickupLng,
  deliveryLat,
  deliveryLng,
  liveLat,
  liveLng,
  onDirections,
  className,
}: DispatchRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const hasOrigin = pickupLat != null && pickupLng != null;
  const hasDestination = deliveryLat != null && deliveryLng != null;
  const hasCoords = hasOrigin && hasDestination;
  const hasToken = isMapboxPublicTokenConfigured();

  const { data: directions } = useDirectionsQuery(
    {
      origin: hasOrigin ? { lat: pickupLat!, lng: pickupLng! } : null,
      destination: hasDestination ? { lat: deliveryLat!, lng: deliveryLng! } : null,
    },
    { enabled: hasCoords && hasToken },
  );

  // Notify parent when directions load (for distance/duration display)
  useEffect(() => {
    if (directions && onDirections) onDirections(directions);
  }, [directions, onDirections]);

  // ── Initialize map once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !hasToken) return;

    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;

    const center: [number, number] = hasCoords
      ? [(pickupLng! + deliveryLng!) / 2, (pickupLat! + deliveryLat!) / 2]
      : [69.24, 41.3]; // Tashkent fallback

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapboxStyleUrl('dark'),
      center,
      zoom: hasCoords ? 6 : 9,
      attributionControl: false,
    });

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'bottom-right',
    );
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-left',
    );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pickup + delivery markers ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasCoords) return;

    const markers: mapboxgl.Marker[] = [];

    const addMarkers = () => {
      // Pickup — orange dot
      const pe = document.createElement('div');
      pe.style.cssText =
        'width:14px;height:14px;border-radius:50%;background:#F97316;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,.5);';
      markers.push(
        new mapboxgl.Marker({ element: pe })
          .setLngLat([pickupLng!, pickupLat!])
          .addTo(map),
      );

      // Delivery — green dot
      const de = document.createElement('div');
      de.style.cssText =
        'width:14px;height:14px;border-radius:50%;background:#22C55E;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,.5);';
      markers.push(
        new mapboxgl.Marker({ element: de })
          .setLngLat([deliveryLng!, deliveryLat!])
          .addTo(map),
      );

      const bounds = new mapboxgl.LngLatBounds(
        [pickupLng!, pickupLat!],
        [deliveryLng!, deliveryLat!],
      );
      map.fitBounds(bounds, { padding: 56, maxZoom: 11, duration: 700 });
    };

    if (map.isStyleLoaded()) addMarkers();
    else map.once('load', addMarkers);

    return () => markers.forEach((m) => m.remove());
  }, [hasCoords, pickupLat, pickupLng, deliveryLat, deliveryLng]);

  // ── Route line ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !directions?.geojson) return;

    const SOURCE = 'dispatch-route';
    const LAYER_BG = 'dispatch-route-bg';
    const LAYER_LINE = 'dispatch-route-line';

    const addRoute = () => {
      const gj = directions.geojson as mapboxgl.GeoJSONSourceSpecification['data'];

      if (map.getSource(SOURCE)) {
        (map.getSource(SOURCE) as mapboxgl.GeoJSONSource).setData(gj);
      } else {
        map.addSource(SOURCE, { type: 'geojson', data: gj });
        map.addLayer({
          id: LAYER_BG,
          type: 'line',
          source: SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#000000', 'line-width': 6, 'line-opacity': 0.25 },
        });
        map.addLayer({
          id: LAYER_LINE,
          type: 'line',
          source: SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#F97316', 'line-width': 3.5, 'line-opacity': 0.95 },
        });
      }

      const coords = directions.geometry?.coordinates;
      if (coords?.length) {
        const b = coords.reduce(
          (acc, c) => acc.extend(c as [number, number]),
          new mapboxgl.LngLatBounds(
            coords[0] as [number, number],
            coords[0] as [number, number],
          ),
        );
        map.fitBounds(b, { padding: 56, maxZoom: 11, duration: 500 });
      }
    };

    if (map.isStyleLoaded()) addRoute();
    else map.once('load', addRoute);
  }, [directions]);

  // ── Live vehicle marker ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || liveLat == null || liveLng == null) return;

    const el = document.createElement('div');
    el.style.cssText =
      'width:12px;height:12px;border-radius:50%;background:#60A5FA;border:2px solid #ffffff;box-shadow:0 0 8px rgba(96,165,250,.7);';
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([liveLng, liveLat])
      .addTo(map);

    return () => { marker.remove(); };
  }, [liveLat, liveLng]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!hasToken) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-xl border border-border/60 bg-muted/10',
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          Map not configured — VITE_MAPBOX_ACCESS_TOKEN missing.
        </p>
      </div>
    );
  }

  if (!hasCoords) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/10',
          className,
        )}
      >
        <MapPin className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">Route map unavailable</p>
        <p className="max-w-[200px] text-center text-xs text-muted-foreground/50">
          Pickup and delivery coordinates are required to display the planned route.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className={cn('overflow-hidden rounded-xl', className)} />;
}
