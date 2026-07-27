'use client';

import { memo, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { TripReplayPoint } from '@/lib/api/telematics';

const RECORDED_POINTS_SOURCE = 'trip-replay-recorded-points';
const RECORDED_POINTS_LAYER = 'trip-replay-recorded-points-layer';

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
  points: TripReplayPoint[];
  currentPoint: TripReplayPoint;
}

export const TripReplayMap = memo(function TripReplayMap({
  points,
  currentPoint,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endpointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pointsRef = useRef(points);

  pointsRef.current = points;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [currentPoint.lng, currentPoint.lat],
      zoom: 13,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.once('load', () => {
      renderRecordedPoints(map, pointsRef.current);
      fitRecordedPoints(map, pointsRef.current);
      endpointMarkersRef.current = createEndpointMarkers(
        map,
        pointsRef.current,
      );
    });

    return () => {
      resizeObserver.disconnect();
      currentMarkerRef.current?.remove();
      currentMarkerRef.current = null;
      endpointMarkersRef.current.forEach((marker) => marker.remove());
      endpointMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // Map initialization is intentionally one-time; subsequent fixes are
    // applied imperatively below so a 10k-point replay does not rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      renderRecordedPoints(map, points);
      endpointMarkersRef.current.forEach((marker) => marker.remove());
      endpointMarkersRef.current = createEndpointMarkers(map, points);
      fitRecordedPoints(map, points);
    };

    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!currentMarkerRef.current) {
      const element = document.createElement('div');
      element.className =
        'flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand shadow-lg';
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', 'Vehicle replay position');
      element.innerHTML =
        '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" style="color:white"><path d="M5 17h14M6 17l1-7h10l1 7M8 10l1-3h6l1 3"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>';
      currentMarkerRef.current = new maplibregl.Marker({
        element,
        rotationAlignment: 'map',
      })
        .setLngLat([currentPoint.lng, currentPoint.lat])
        .addTo(map);
    } else {
      // Deliberately jump to the returned fix. No coordinate interpolation.
      currentMarkerRef.current.setLngLat([currentPoint.lng, currentPoint.lat]);
    }

    currentMarkerRef.current.setRotation(currentPoint.heading ?? 0);
  }, [currentPoint]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[22rem] w-full"
      aria-label="Trip replay map showing recorded GPS positions"
    />
  );
});

function recordedPointsData(points: TripReplayPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      properties: { at: point.at, movementState: point.movementState },
      geometry: {
        type: 'Point' as const,
        coordinates: [point.lng, point.lat],
      },
    })),
  };
}

function renderRecordedPoints(
  map: maplibregl.Map,
  points: TripReplayPoint[],
): void {
  const existing = map.getSource(RECORDED_POINTS_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;
  const data = recordedPointsData(points);
  if (existing) {
    existing.setData(data);
    return;
  }

  map.addSource(RECORDED_POINTS_SOURCE, { type: 'geojson', data });
  map.addLayer({
    id: RECORDED_POINTS_LAYER,
    type: 'circle',
    source: RECORDED_POINTS_SOURCE,
    paint: {
      'circle-radius': 2.5,
      'circle-color': '#60a5fa',
      'circle-opacity': 0.52,
      'circle-stroke-width': 0.5,
      'circle-stroke-color': '#dbeafe',
    },
  });
}

function fitRecordedPoints(
  map: maplibregl.Map,
  points: TripReplayPoint[],
): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const point of points) bounds.extend([point.lng, point.lat]);
  map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
}

function createEndpointMarkers(
  map: maplibregl.Map,
  points: TripReplayPoint[],
): maplibregl.Marker[] {
  if (points.length === 0) return [];
  const endpoints: Array<{
    point: TripReplayPoint;
    label: string;
    aria: string;
  }> = [
    { point: points[0], label: 'A', aria: 'Trip start' },
    {
      point: points[points.length - 1],
      label: 'B',
      aria: 'Trip end',
    },
  ];

  return endpoints.map(({ point, label, aria }) => {
    const element = document.createElement('div');
    element.className =
      'flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-surface-elevated font-mono text-[10px] font-bold text-foreground shadow';
    element.textContent = label;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', aria);
    return new maplibregl.Marker({ element })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
  });
}
