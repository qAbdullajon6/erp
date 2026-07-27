'use client';

import { memo, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Geofence } from '@/lib/api/telematics-geofences';
import type { GeofenceEventItem } from '@/lib/api/telematics';
import {
  fenceMapColor,
  hasRenderableGeometry,
} from '@/components/fleet-geofences/geofences-ops';

const SOURCE_ID = 'geofences-source';
const FILL_LAYER = 'geofences-fill';
const LINE_LAYER = 'geofences-line';
const EVENT_SOURCE = 'geofence-event-point';
const EVENT_LAYER = 'geofence-event-point-layer';

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 0.68,
        'raster-brightness-max': 0.55,
        'raster-contrast': 0.25,
      },
    },
  ],
};

interface Props {
  fences: Geofence[];
  selectedId: string | null;
  highlightedEvent: GeofenceEventItem | null;
  onSelect: (id: string) => void;
}

export const GeofencesMap = memo(function GeofencesMap({
  fences,
  selectedId,
  highlightedEvent,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [0, 20],
      zoom: 1.6,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on('click', FILL_LAYER, (event) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id === 'string') onSelectRef.current(id);
    });
    map.on('mouseenter', FILL_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', FILL_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const data = toFeatureCollection(fences, selectedId);
      const existing = map.getSource(SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data });
        map.addLayer({
          id: FILL_LAYER,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': [
              'case',
              ['boolean', ['get', 'selected'], false],
              0.35,
              0.18,
            ],
          },
        });
        map.addLayer({
          id: LINE_LAYER,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'case',
              ['boolean', ['get', 'selected'], false],
              3,
              1.5,
            ],
            'line-opacity': 0.9,
          },
        });
      }
      fitFences(map, fences, selectedId);
    };

    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [fences, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const data = highlightedEvent
        ? {
            type: 'FeatureCollection' as const,
            features: [
              {
                type: 'Feature' as const,
                properties: { id: highlightedEvent.id },
                geometry: {
                  type: 'Point' as const,
                  coordinates: [
                    highlightedEvent.longitude,
                    highlightedEvent.latitude,
                  ],
                },
              },
            ],
          }
        : { type: 'FeatureCollection' as const, features: [] };

      const existing = map.getSource(EVENT_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(EVENT_SOURCE, { type: 'geojson', data });
        map.addLayer({
          id: EVENT_LAYER,
          type: 'circle',
          source: EVENT_SOURCE,
          paint: {
            'circle-radius': 7,
            'circle-color': '#f59e0b',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }

      if (highlightedEvent) {
        map.flyTo({
          center: [highlightedEvent.longitude, highlightedEvent.latitude],
          zoom: Math.max(map.getZoom(), 13),
          duration: 500,
        });
      }
    };

    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [highlightedEvent]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[20rem] w-full"
      aria-label="Geofence map"
    />
  );
});

function toFeatureCollection(fences: Geofence[], selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: fences
      .filter(hasRenderableGeometry)
      .map((fence) => {
        const selected = fence.id === selectedId;
        const color = fenceMapColor(fence, selected);
        if (fence.type === 'CIRCLE') {
          return {
            type: 'Feature' as const,
            properties: { id: fence.id, selected, color },
            geometry: {
              type: 'Polygon' as const,
              coordinates: [
                circlePolygon(
                  fence.centerLng!,
                  fence.centerLat!,
                  fence.radiusM!,
                ),
              ],
            },
          };
        }
        const ring = fence.polygon!.map((v) => [v.lng, v.lat] as [number, number]);
        if (
          ring[0][0] !== ring[ring.length - 1][0] ||
          ring[0][1] !== ring[ring.length - 1][1]
        ) {
          ring.push(ring[0]);
        }
        return {
          type: 'Feature' as const,
          properties: { id: fence.id, selected, color },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [ring],
          },
        };
      }),
  };
}

/// Approximate a circle as a polygon for MapLibre fill/line layers.
function circlePolygon(
  lng: number,
  lat: number,
  radiusM: number,
  steps = 64,
): [number, number][] {
  const coords: [number, number][] = [];
  const earth = 6378137;
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const dx = (radiusM / earth) * Math.cos(bearing);
    const dy = (radiusM / earth) * Math.sin(bearing);
    const nextLat = lat + (dy * 180) / Math.PI;
    const nextLng =
      lng + ((dx * 180) / Math.PI) / Math.cos((lat * Math.PI) / 180);
    coords.push([nextLng, nextLat]);
  }
  return coords;
}

function fitFences(
  map: maplibregl.Map,
  fences: Geofence[],
  selectedId: string | null,
): void {
  const selected = fences.find((f) => f.id === selectedId);
  const targets = selected && hasRenderableGeometry(selected)
    ? [selected]
    : fences.filter(hasRenderableGeometry);
  if (targets.length === 0) return;

  const bounds = new maplibregl.LngLatBounds();
  for (const fence of targets) {
    if (fence.type === 'CIRCLE') {
      const ring = circlePolygon(
        fence.centerLng!,
        fence.centerLat!,
        fence.radiusM!,
        24,
      );
      for (const [lng, lat] of ring) bounds.extend([lng, lat]);
    } else {
      for (const v of fence.polygon!) bounds.extend([v.lng, v.lat]);
    }
  }
  map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 450 });
}
