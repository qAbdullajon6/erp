'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/list-states';
import {
  applyTrackingEvent,
  trackingAPI,
  type StreamStatus,
  type TrackingHistoryPoint,
  type TrackingVehicle,
} from '@/lib/api/tracking';
import { useDirectionsQuery } from '@/lib/api/tracking-map';
import {
  hasCoordinates,
  movementMarkerColor,
  readMapView,
  vehicleDisplayName,
  writeMapView,
} from '@/components/fleet-tracking/fleet-ops';
import { fenceMapColor, hasRenderableGeometry } from '@/components/fleet-geofences/geofences-ops';
import type { Geofence } from '@/lib/api/telematics-geofences';
import {
  FleetMapToolbar,
  type FleetMapStyleOption,
} from '@/components/fleet-tracking/fleet-map-toolbar';
import {
  isMapboxPublicTokenConfigured,
  MAPBOX_PUBLIC_TOKEN,
  mapboxStyleUrl,
  mapboxTokenErrorMessage,
} from '@/lib/mapbox';
import { Maximize2, Minimize2, Focus, MapPin, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  bindLayerHoverHandlers,
  createSelectedMarkerClickHandler,
  nextSseReconnectDelayMs,
  reduceStreamStatus,
} from '@/components/fleet-tracking/fleet-tracking-hardening';

const FLEET_SOURCE = 'fleet-vehicles';
const FLEET_CLUSTER = 'fleet-clusters';
const FLEET_CLUSTER_COUNT = 'fleet-cluster-count';
const FLEET_UNCLUSTERED = 'fleet-unclustered';
const FLEET_HEADING = 'fleet-heading';
const FLEET_HEADING_IMAGE = 'fleet-heading-arrow';
const GEOFENCE_SOURCE = 'fleet-geofences';
const GEOFENCE_FILL_LAYER = 'fleet-geofences-fill';
const GEOFENCE_LINE_LAYER = 'fleet-geofences-line';
const HISTORY_SOURCE = 'selected-history-route';
const HISTORY_LAYER = 'selected-history-route-line';
const DIRECTIONS_SOURCE = 'selected-directions-route';
const DIRECTIONS_LAYER = 'selected-directions-route-line';
const TRAFFIC_SOURCE = 'mapbox-traffic';
const TRAFFIC_LAYER = 'mapbox-traffic-layer';

export type FleetMapHandle = {
  fitAll: () => void;
  resetView: () => void;
  toggleFullscreen: () => void;
  focusVehicle: (vehicleId: string) => void;
  fitSelected: (ids: string[]) => void;
  locateMe: () => void;
  getView: () => { center: [number, number]; zoom: number };
};

interface FleetMapProps {
  vehicles: TrackingVehicle[];
  selectedIds: string[];
  selectedVehicleId: string | null;
  geofences?: Geofence[];
  historyPoints?: TrackingHistoryPoint[];
  mapStyle: FleetMapStyleOption;
  clusters: boolean;
  traffic: boolean;
  labels: boolean;
  follow: boolean;
  onMapStyleChange: (style: FleetMapStyleOption) => void;
  onClustersChange: (value: boolean) => void;
  onTrafficChange: (value: boolean) => void;
  onLabelsChange: (value: boolean) => void;
  onFollowChange: (value: boolean) => void;
  onVehiclesUpdate: Dispatch<SetStateAction<TrackingVehicle[]>>;
  onSelectVehicle: (vehicleId: string | null) => void;
  onStreamStatusChange?: (status: StreamStatus) => void;
  /// When set, browser fullscreen targets this element (map + sidebar shell).
  fullscreenRootRef?: RefObject<HTMLElement | null>;
  className?: string;
}

function cameraDuration(): number {
  if (typeof window === 'undefined') return 600;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
}

export const FleetMap = forwardRef<FleetMapHandle, FleetMapProps>(function FleetMap(
  {
    vehicles,
    selectedIds,
    selectedVehicleId,
    geofences = [],
    historyPoints = [],
    mapStyle,
    clusters,
    traffic,
    labels,
    follow,
    onMapStyleChange,
    onClustersChange,
    onTrafficChange,
    onLabelsChange,
    onFollowChange,
    onVehiclesUpdate,
    onSelectVehicle,
    onStreamStatusChange,
    fullscreenRootRef,
    className,
  },
  ref,
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapShell = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const selectedMarker = useRef<mapboxgl.Marker | null>(null);
  const selectedVehicleIdRef = useRef<string | null>(selectedVehicleId);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const startMarker = useRef<mapboxgl.Marker | null>(null);
  const endMarker = useRef<mapboxgl.Marker | null>(null);
  const popup = useRef<mapboxgl.Popup | null>(null);
  const vehiclesRef = useRef(vehicles);
  const selectedIdsRef = useRef(selectedIds);
  const didFit = useRef(false);
  const styleModeRef = useRef(mapStyle);
  const clustersRef = useRef(clusters);
  const labelLayerIdsRef = useRef<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tokenOk] = useState(() => isMapboxPublicTokenConfigured());

  vehiclesRef.current = vehicles;
  selectedIdsRef.current = selectedIds;
  selectedVehicleIdRef.current = selectedVehicleId;
  onSelectVehicleRef.current = onSelectVehicle;

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.vehicleId === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const historyCoords = useMemo(() => {
    return historyPoints
      .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
      .map((p) => [p.lng, p.lat] as [number, number]);
  }, [historyPoints]);

  const routeOrigin = useMemo(() => {
    if (historyCoords.length >= 2) {
      const [lng, lat] = historyCoords[0];
      return { lat, lng };
    }
    return null;
  }, [historyCoords]);

  const routeDestination = useMemo(() => {
    if (selectedVehicle && hasCoordinates(selectedVehicle)) {
      return {
        lat: selectedVehicle.latitude!,
        lng: selectedVehicle.longitude!,
      };
    }
    if (historyCoords.length >= 2) {
      const [lng, lat] = historyCoords[historyCoords.length - 1];
      return { lat, lng };
    }
    return null;
  }, [selectedVehicle, historyCoords]);

  const directions = useDirectionsQuery(
    { origin: routeOrigin, destination: routeDestination },
    {
      enabled:
        !!selectedVehicleId &&
        routeOrigin != null &&
        routeDestination != null &&
        historyCoords.length >= 2,
    },
  );

  const fleetGeoJson = useMemo(() => {
    const features = vehicles
      .filter(hasCoordinates)
      .filter((v) => v.vehicleId !== selectedVehicleId)
      .map((vehicle) => ({
        type: 'Feature' as const,
        properties: {
          id: vehicle.vehicleId,
          label: vehicleDisplayName(vehicle),
          movementState: vehicle.movementState,
          heading: vehicle.heading ?? 0,
          hasHeading: vehicle.heading != null && Number.isFinite(vehicle.heading) ? 1 : 0,
          offline: vehicle.isStale || vehicle.movementState === 'OFFLINE' ? 1 : 0,
          selected: selectedIdSet.has(vehicle.vehicleId) ? 1 : 0,
          color: movementMarkerColor(vehicle.movementState),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [vehicle.longitude!, vehicle.latitude!] as [number, number],
        },
      }));
    return { type: 'FeatureCollection' as const, features };
  }, [vehicles, selectedVehicleId, selectedIdSet]);

  // Same fill+line technique as the dedicated Geofences page — this map is a
  // separate mapboxgl instance from that page's maplibregl one, so the layers
  // can't be shared directly, but the GeoJSON shape and styling are the same.
  const geofenceGeoJson = useMemo(() => {
    const features = geofences.filter(hasRenderableGeometry).map((fence) => {
      const color = fenceMapColor(fence, false);
      const coordinates =
        fence.type === 'CIRCLE'
          ? [circlePolygon(fence.centerLng!, fence.centerLat!, fence.radiusM!)]
          : [closedRing(fence.polygon!.map((v) => [v.lng, v.lat] as [number, number]))];
      return {
        type: 'Feature' as const,
        properties: { id: fence.id, name: fence.name, color },
        geometry: { type: 'Polygon' as const, coordinates },
      };
    });
    return { type: 'FeatureCollection' as const, features };
  }, [geofences]);

  useEffect(() => {
    const onChange = () => {
      const target = fullscreenRootRef?.current ?? mapShell.current;
      setFullscreen(document.fullscreenElement === target);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fullscreenRootRef]);

  const fitAll = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    const withCoords = vehicles.filter(hasCoordinates);
    if (withCoords.length === 0) return;
    const duration = cameraDuration();
    if (withCoords.length === 1) {
      const v = withCoords[0];
      mapInstance.flyTo({
        center: [v.longitude!, v.latitude!],
        zoom: 14,
        duration,
      });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const v of withCoords) {
      bounds.extend([v.longitude!, v.latitude!]);
    }
    mapInstance.fitBounds(bounds, { padding: 64, maxZoom: 14, duration });
  }, [vehicles]);

  const fitSelected = useCallback(
    (ids: string[]) => {
      const mapInstance = map.current;
      if (!mapInstance || ids.length === 0) return;
      const targets = vehiclesRef.current.filter(
        (v) => ids.includes(v.vehicleId) && hasCoordinates(v),
      );
      if (targets.length === 0) return;
      const duration = cameraDuration();
      if (targets.length === 1) {
        const v = targets[0];
        mapInstance.flyTo({
          center: [v.longitude!, v.latitude!],
          zoom: 15,
          duration,
        });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      for (const v of targets) {
        bounds.extend([v.longitude!, v.latitude!]);
      }
      mapInstance.fitBounds(bounds, { padding: 72, maxZoom: 15, duration });
    },
    [],
  );

  const fitSelection = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance || !selectedVehicle || !hasCoordinates(selectedVehicle)) return;

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([selectedVehicle.longitude!, selectedVehicle.latitude!]);
    for (const coord of historyCoords) bounds.extend(coord);
    const routeCoords = directions.data?.geometry.coordinates;
    if (routeCoords) {
      for (const coord of routeCoords) bounds.extend(coord);
    }
    mapInstance.fitBounds(bounds, {
      padding: 72,
      maxZoom: 15,
      duration: cameraDuration(),
    });
  }, [selectedVehicle, historyCoords, directions.data]);

  const openPopupFor = useCallback((vehicle: TrackingVehicle) => {
    const mapInstance = map.current;
    if (!mapInstance || !hasCoordinates(vehicle)) return;

    if (!popup.current) {
      popup.current = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 18,
        maxWidth: '240px',
        className: 'fleet-tracking-popup',
      });
    }

    const speed =
      vehicle.speedKph != null ? `${Math.round(vehicle.speedKph)} km/h` : '—';
    const html = `
      <div style="font: 12px/1.4 ui-sans-serif, system-ui; min-width: 140px">
        <div style="font-weight: 600; font-family: ui-monospace, monospace">${escapeHtml(vehicleDisplayName(vehicle))}</div>
        <div style="color: #64748b; margin-top: 2px">${escapeHtml(vehicle.movementState)}</div>
        <div style="margin-top: 4px">Speed ${escapeHtml(speed)}</div>
      </div>
    `;

    popup.current
      .setLngLat([vehicle.longitude!, vehicle.latitude!])
      .setHTML(html)
      .addTo(mapInstance);
  }, []);

  const focusVehicle = useCallback(
    (vehicleId: string) => {
      const mapInstance = map.current;
      const vehicle = vehiclesRef.current.find((v) => v.vehicleId === vehicleId);
      if (!mapInstance || !vehicle || !hasCoordinates(vehicle)) return;
      mapInstance.flyTo({
        center: [vehicle.longitude!, vehicle.latitude!],
        zoom: 15,
        duration: cameraDuration(),
      });
      openPopupFor(vehicle);
    },
    [openPopupFor],
  );

  const resetView = useCallback(() => {
    didFit.current = false;
    fitAll();
    if (!vehicles.some(hasCoordinates)) {
      map.current?.flyTo({ center: [0, 20], zoom: 1.6, duration: cameraDuration() });
    }
  }, [fitAll, vehicles]);

  const toggleFullscreen = useCallback(() => {
    const target = fullscreenRootRef?.current ?? mapShell.current;
    if (!document.fullscreenElement) {
      void target?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, [fullscreenRootRef]);

  const getView = useCallback((): { center: [number, number]; zoom: number } => {
    const mapInstance = map.current;
    if (!mapInstance) return { center: [0, 20], zoom: 1.6 };
    const c = mapInstance.getCenter();
    return { center: [c.lng, c.lat], zoom: mapInstance.getZoom() };
  }, []);

  const locateMe = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    if (!navigator.geolocation) {
      setMapError('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapError(null);
        mapInstance.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
          duration: cameraDuration(),
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable location access to locate yourself on the map.'
            : 'Unable to determine your location.';
        setMapError(msg);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fitAll,
      resetView,
      toggleFullscreen,
      focusVehicle,
      fitSelected,
      locateMe,
      getView,
    }),
    [fitAll, resetView, toggleFullscreen, focusVehicle, fitSelected, locateMe, getView],
  );

  // Initialize Mapbox map once when public token is present.
  useEffect(() => {
    if (!tokenOk || !mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
    styleModeRef.current = mapStyle;
    clustersRef.current = clusters;

    const savedView = readMapView();
    let cancelled = false;
    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapboxStyleUrl(mapStyle),
      center: savedView?.center ?? [0, 20],
      zoom: savedView?.zoom ?? 1.6,
      attributionControl: true,
      antialias: true,
      failIfMajorPerformanceCaveat: false,
    });
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    instance.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
    map.current = instance;

    const persistView = () => {
      const c = instance.getCenter();
      writeMapView([c.lng, c.lat], instance.getZoom());
    };
    instance.on('moveend', persistView);

    const onError = (event: { error?: Error & { status?: number; message?: string } }) => {
      const status = event.error?.status;
      const message = event.error?.message ?? '';
      if (status === 401 || status === 403 || /unauthorized|invalid.*token/i.test(message)) {
        setMapError('Mapbox rejected the public access token. Check VITE_MAPBOX_ACCESS_TOKEN.');
        return;
      }
      if (status === 429 || /rate.?limit/i.test(message)) {
        setMapError('Mapbox tile rate limit reached. Retrying shortly…');
        return;
      }
      if (/Failed to fetch|NetworkError|tile/i.test(message)) {
        setMapError('Map tiles failed to load. Check network connectivity and retry.');
      }
    };

    instance.on('error', onError);
    instance.once('load', () => {
      if (cancelled) return;
      setMapReady(true);
      setMapError(null);
      ensureGeofenceLayer(instance);
      ensureFleetLayers(instance, clusters);
      labelLayerIdsRef.current = collectSymbolLayerIds(instance);
    });

    const resizeTarget = mapShell.current ?? mapContainer.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && resizeTarget
        ? new ResizeObserver(() => {
            instance.resize();
          })
        : null;
    if (resizeObserver && resizeTarget) resizeObserver.observe(resizeTarget);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      instance.off('error', onError);
      instance.off('moveend', persistView);
      popup.current?.remove();
      popup.current = null;
      selectedMarker.current?.remove();
      selectedMarker.current = null;
      startMarker.current?.remove();
      startMarker.current = null;
      endMarker.current?.remove();
      endMarker.current = null;
      instance.remove();
      map.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk]);

  // Resize when workspace chrome changes (sidebar collapse, mobile panes, fullscreen).
  useEffect(() => {
    const mapInstance = map.current;
    const shell = mapShell.current;
    if (!mapInstance || !shell || !mapReady) return;
    mapInstance.resize();
  }, [mapReady, fullscreen]);

  // Style swap without destroying markers state.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;
    if (styleModeRef.current === mapStyle) return;
    styleModeRef.current = mapStyle;
    setMapReady(false);
    mapInstance.setStyle(mapboxStyleUrl(mapStyle));
    mapInstance.once('style.load', () => {
      ensureGeofenceLayer(mapInstance);
      ensureFleetLayers(mapInstance, clustersRef.current);
      labelLayerIdsRef.current = collectSymbolLayerIds(mapInstance);
      applyTrafficLayer(mapInstance, traffic);
      applyLabelVisibility(mapInstance, labelLayerIdsRef.current, labels);
      setMapReady(true);
    });
  }, [mapStyle, mapReady, traffic, labels]);

  // Recreate fleet source when clusters toggle changes.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;
    if (clustersRef.current === clusters) return;
    clustersRef.current = clusters;
    removeFleetLayers(mapInstance);
    ensureFleetLayers(mapInstance, clusters);
    const source = mapInstance.getSource(FLEET_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(fleetGeoJson);
  }, [clusters, mapReady, fleetGeoJson]);

  // Traffic overlay.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;
    applyTrafficLayer(mapInstance, traffic);
  }, [traffic, mapReady]);

  // Label visibility toggle.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;
    applyLabelVisibility(mapInstance, labelLayerIdsRef.current, labels);
  }, [labels, mapReady]);

  // Follow selected vehicle on position updates.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady || !follow || !selectedVehicle || !hasCoordinates(selectedVehicle)) {
      return;
    }
    mapInstance.easeTo({
      center: [selectedVehicle.longitude!, selectedVehicle.latitude!],
      duration: cameraDuration(),
    });
  }, [
    follow,
    mapReady,
    selectedVehicle?.latitude,
    selectedVehicle?.longitude,
    selectedVehicle,
  ]);

  // SSE with reconnect / backoff. Each connect() calls trackingAPI.streamLive,
  // which reads a fresh access token from sessionManager — reconnects do not
  // reuse a stale JWT from the first mount.
  //
  // Status semantics:
  // - connecting / reconnecting → HTTP open in progress
  // - connected_waiting → SSE open; keep-alive alone stays here
  // - live → position/state data events arrived
  useEffect(() => {
    const controller = new AbortController();
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let status: StreamStatus = 'disconnected';

    const emit = (action: Parameters<typeof reduceStreamStatus>[1]) => {
      status = reduceStreamStatus(status, action);
      onStreamStatusChange?.(status);
    };

    const connect = async () => {
      if (stopped || controller.signal.aborted) return;
      emit({ type: 'connect_start', attempt });

      try {
        for await (const event of trackingAPI.streamLive({
          signal: controller.signal,
          onOpen: () => {
            if (stopped || controller.signal.aborted) return;
            emit({ type: 'opened' });
          },
        })) {
          if (stopped) break;
          attempt = 0;
          emit({ type: 'data_event', eventType: event.type });
          // Keep-alive comments never yield here. LIVE_DATA requires position/state.
          onVehiclesUpdate((prev) => applyTrackingEvent(prev, event));
        }
        if (stopped || controller.signal.aborted) return;
        emit({ type: 'stream_end' });
      } catch (err) {
        if (controller.signal.aborted || stopped) return;
        console.error('Tracking live stream error:', err);
        emit({ type: 'stream_error' });
      }

      if (controller.signal.aborted || stopped) return;
      const delay = nextSseReconnectDelayMs(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    void connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller.abort();
      emit({ type: 'cleanup' });
    };
  }, [onVehiclesUpdate, onStreamStatusChange]);

  // Geofence overlay — static fill+line under the vehicle layers, refreshed
  // whenever the geofences list changes (create/edit/archive) or the style
  // swap wiped it.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;

    const source = mapInstance.getSource(GEOFENCE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geofenceGeoJson);
    } else {
      ensureGeofenceLayer(mapInstance);
      const created = mapInstance.getSource(GEOFENCE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      created?.setData(geofenceGeoJson);
    }
  }, [geofenceGeoJson, mapReady]);

  // Clustered fleet GeoJSON data only — never bind listeners here so SSE
  // position ticks do not re-register mouseenter/click handlers.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;

    const source = mapInstance.getSource(FLEET_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(fleetGeoJson);
    } else {
      ensureFleetLayers(mapInstance, clusters);
      const created = mapInstance.getSource(FLEET_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      created?.setData(fleetGeoJson);
    }

    if (!didFit.current && fleetGeoJson.features.length > 0 && !readMapView()) {
      didFit.current = true;
      fitAll();
    }
  }, [fleetGeoJson, mapReady, clusters, fitAll]);

  // Fleet layer interactions — bind once per layer lifecycle (mapReady / cluster mode).
  // Clicks read selection via onSelectVehicleRef so GeoJSON updates do not rebind.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;
    if (!mapInstance.getLayer(FLEET_UNCLUSTERED)) return;

    const onClickUnclustered = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0] as
        | { properties?: { id?: unknown } }
        | undefined;
      const id = feature?.properties?.id;
      if (typeof id === 'string') onSelectVehicleRef.current(id);
    };
    const onClickCluster = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0] as
        | {
            properties?: { cluster_id?: number };
            geometry?: { type?: string; coordinates?: number[] };
          }
        | undefined;
      const clusterId = feature?.properties?.cluster_id;
      const clusterSource = mapInstance.getSource(FLEET_SOURCE) as mapboxgl.GeoJSONSource;
      if (
        clusterId == null ||
        !feature?.geometry ||
        feature.geometry.type !== 'Point' ||
        !feature.geometry.coordinates
      ) {
        return;
      }
      const coords = feature.geometry.coordinates as [number, number];
      clusterSource.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        mapInstance.easeTo({
          center: coords,
          zoom,
          duration: cameraDuration(),
        });
      });
    };

    const setPointer = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };
    const clearPointer = () => {
      mapInstance.getCanvas().style.cursor = '';
    };

    const hoverLayers = [FLEET_UNCLUSTERED, FLEET_CLUSTER];
    if (mapInstance.getLayer(FLEET_HEADING)) hoverLayers.push(FLEET_HEADING);

    mapInstance.on('click', FLEET_UNCLUSTERED, onClickUnclustered);
    mapInstance.on('click', FLEET_CLUSTER, onClickCluster);
    if (mapInstance.getLayer(FLEET_HEADING)) {
      mapInstance.on('click', FLEET_HEADING, onClickUnclustered);
    }
    const unbindHover = bindLayerHoverHandlers(
      mapInstance,
      hoverLayers,
      setPointer,
      clearPointer,
    );

    return () => {
      mapInstance.off('click', FLEET_UNCLUSTERED, onClickUnclustered);
      mapInstance.off('click', FLEET_CLUSTER, onClickCluster);
      if (mapInstance.getLayer(FLEET_HEADING)) {
        mapInstance.off('click', FLEET_HEADING, onClickUnclustered);
      }
      unbindHover();
    };
  }, [mapReady, clusters]);

  // Selected vehicle marker — heading, movement color, offline opacity, smooth updates.
  // Click uses refs so the listener always selects the CURRENT vehicleId.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;

    if (!selectedVehicle || !hasCoordinates(selectedVehicle)) {
      selectedMarker.current?.remove();
      selectedMarker.current = null;
      return;
    }

    const lngLat: [number, number] = [
      selectedVehicle.longitude!,
      selectedVehicle.latitude!,
    ];
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!selectedMarker.current) {
      const el = document.createElement('div');
      el.className = 'fleet-selected-marker';
      el.style.width = '44px';
      el.style.height = '44px';
      el.style.transition = reducedMotion
        ? 'none'
        : 'transform 280ms ease-out, opacity 200ms ease';
      el.innerHTML = getMarkerSVG(selectedVehicle, true);
      el.addEventListener(
        'click',
        createSelectedMarkerClickHandler(
          () => selectedVehicleIdRef.current,
          (id) => onSelectVehicleRef.current(id),
        ),
      );
      selectedMarker.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat(lngLat)
        .addTo(mapInstance);
    } else {
      selectedMarker.current.setLngLat(lngLat);
      const el = selectedMarker.current.getElement();
      el.style.opacity =
        selectedVehicle.isStale || selectedVehicle.movementState === 'OFFLINE'
          ? '0.45'
          : '1';
      el.innerHTML = getMarkerSVG(selectedVehicle, true);
    }
  }, [selectedVehicle, mapReady]);

  // History route + start / end markers.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;

    const ensureHistory = () => {
      if (!mapInstance.getSource(HISTORY_SOURCE)) {
        mapInstance.addSource(HISTORY_SOURCE, {
          type: 'geojson',
          data: emptyLine(),
        });
        mapInstance.addLayer({
          id: HISTORY_LAYER,
          type: 'line',
          source: HISTORY_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#94a3b8',
            'line-width': 3,
            'line-opacity': 0.7,
            'line-dasharray': [1.5, 1.5],
          },
        });
      }

      const source = mapInstance.getSource(HISTORY_SOURCE) as mapboxgl.GeoJSONSource;
      source.setData(
        historyCoords.length >= 2
          ? {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: historyCoords },
            }
          : emptyLine(),
      );
    };

    ensureHistory();

    if (historyCoords.length >= 2 && selectedVehicleId) {
      const start = historyCoords[0];
      const end = historyCoords[historyCoords.length - 1];
      startMarker.current =
        upsertEndpointMarker(mapInstance, startMarker.current, start, 'Start', '#22c55e');
      endMarker.current =
        upsertEndpointMarker(mapInstance, endMarker.current, end, 'Latest trail', '#6366f1');
    } else {
      startMarker.current?.remove();
      startMarker.current = null;
      endMarker.current?.remove();
      endMarker.current = null;
    }
  }, [historyCoords, selectedVehicleId, mapReady]);

  // Road-snapped directions overlay.
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) return;

    if (!mapInstance.getSource(DIRECTIONS_SOURCE)) {
      mapInstance.addSource(DIRECTIONS_SOURCE, {
        type: 'geojson',
        data: emptyLine(),
      });
      mapInstance.addLayer({
        id: DIRECTIONS_LAYER,
        type: 'line',
        source: DIRECTIONS_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });
    }

    const source = mapInstance.getSource(DIRECTIONS_SOURCE) as mapboxgl.GeoJSONSource;
    source.setData(directions.data?.geojson ?? emptyLine());
  }, [directions.data, mapReady]);

  // Selection camera fit once (not on every SSE tick).
  useEffect(() => {
    if (!selectedVehicleId || !mapReady || follow) {
      if (!selectedVehicleId) popup.current?.remove();
      return;
    }
    if (selectedVehicle && hasCoordinates(selectedVehicle)) {
      fitSelection();
      openPopupFor(selectedVehicle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleId, mapReady]);

  const trackedCount = vehicles.filter(hasCoordinates).length;
  const showEmptyOverlay = vehicles.length > 0 && trackedCount === 0;

  if (!tokenOk) {
    return (
      <div className={cn('relative flex min-h-[16rem] flex-1 items-center justify-center bg-muted/20 p-6', className)}>
        <ErrorState
          message={mapboxTokenErrorMessage()}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div
      ref={mapShell}
      className={cn('relative min-h-[16rem] flex-1 bg-muted/20', className)}
    >
      <div ref={mapContainer} className="h-full w-full" />

      {!mapReady && !mapError ? (
        <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
          <LoadingState label="Loading Mapbox…" />
        </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-x-3 top-3 z-20 mx-auto max-w-md">
          <div className="rounded-lg border border-destructive/30 bg-surface/95 p-3 shadow-sm">
            <p className="text-xs text-destructive">{mapError}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7"
              onClick={() => {
                setMapError(null);
                const mapInstance = map.current;
                if (mapInstance) {
                  mapInstance.setStyle(mapboxStyleUrl(mapStyle));
                  mapInstance.once('style.load', () => {
                    ensureGeofenceLayer(mapInstance);
                    ensureFleetLayers(mapInstance, clusters);
                    labelLayerIdsRef.current = collectSymbolLayerIds(mapInstance);
                    applyTrafficLayer(mapInstance, traffic);
                    setMapReady(true);
                  });
                }
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry tiles
            </Button>
          </div>
        </div>
      ) : null}

      {directions.errorMessage && selectedVehicleId ? (
        <div className="absolute bottom-3 left-3 z-10 max-w-xs rounded-md border border-border/60 bg-surface/95 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
          Directions: {directions.errorMessage}
        </div>
      ) : null}

      <FleetMapToolbar
        mapStyle={mapStyle}
        clusters={clusters}
        traffic={traffic}
        labels={labels}
        follow={follow}
        canFollow={!!selectedVehicle && hasCoordinates(selectedVehicle)}
        onMapStyleChange={onMapStyleChange}
        onClustersChange={onClustersChange}
        onTrafficChange={onTrafficChange}
        onLabelsChange={onLabelsChange}
        onFollowChange={onFollowChange}
        onResetView={resetView}
        onLocateMe={locateMe}
        onFitSelected={() => fitSelected(selectedIdsRef.current)}
        selectedCount={selectedIds.length}
      />

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 shadow-sm"
          onClick={fitAll}
          disabled={trackedCount === 0}
          aria-label="Fit all tracked vehicles"
          title="Fit all tracked vehicles"
        >
          <Focus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 shadow-sm"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {showEmptyOverlay && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-background/40 p-6 backdrop-blur-[1px]">
          <div className="pointer-events-auto max-w-sm rounded-xl border border-border/70 bg-surface/95 p-1 shadow-lg">
            <EmptyState
              compact
              icon={MapPin}
              title="No coordinates on the map"
              description="These fleet units have tracking state but no latitude/longitude yet. Cards stay available in the list."
            />
          </div>
        </div>
      )}
    </div>
  );
});

function ensureGeofenceLayer(mapInstance: mapboxgl.Map): void {
  if (mapInstance.getSource(GEOFENCE_SOURCE)) return;

  mapInstance.addSource(GEOFENCE_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Added before the fleet source's layers (via call order at every site
  // that creates it) so vehicle markers always paint above the fences.
  mapInstance.addLayer({
    id: GEOFENCE_FILL_LAYER,
    type: 'fill',
    source: GEOFENCE_SOURCE,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 },
  });
  mapInstance.addLayer({
    id: GEOFENCE_LINE_LAYER,
    type: 'line',
    source: GEOFENCE_SOURCE,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.8 },
  });
}

/// Approximates a circle geofence as a polygon for Mapbox's fill/line layers
/// — mirrors the identical helper in geofences-map.tsx (that page uses a
/// separate maplibregl instance, so the function can't be imported directly).
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): [number, number][] {
  const coords: [number, number][] = [];
  const earth = 6378137;
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const dx = (radiusM / earth) * Math.cos(bearing);
    const dy = (radiusM / earth) * Math.sin(bearing);
    const nextLat = lat + (dy * 180) / Math.PI;
    const nextLng = lng + ((dx * 180) / Math.PI) / Math.cos((lat * Math.PI) / 180);
    coords.push([nextLng, nextLat]);
  }
  return coords;
}

function closedRing(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  return firstLng !== lastLng || firstLat !== lastLat ? [...ring, ring[0]] : ring;
}

function removeFleetLayers(mapInstance: mapboxgl.Map): void {
  for (const id of [FLEET_HEADING, FLEET_UNCLUSTERED, FLEET_CLUSTER_COUNT, FLEET_CLUSTER]) {
    if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
  }
  if (mapInstance.getSource(FLEET_SOURCE)) mapInstance.removeSource(FLEET_SOURCE);
}

function ensureHeadingArrowImage(mapInstance: mapboxgl.Map): void {
  if (mapInstance.hasImage(FLEET_HEADING_IMAGE)) return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.12);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.lineTo(size * 0.5, size * 0.62);
  ctx.lineTo(size * 0.28, size * 0.78);
  ctx.closePath();
  ctx.fill();
  const data = ctx.getImageData(0, 0, size, size);
  mapInstance.addImage(FLEET_HEADING_IMAGE, data, { pixelRatio: 2 });
}

function ensureFleetLayers(mapInstance: mapboxgl.Map, cluster: boolean): void {
  if (mapInstance.getSource(FLEET_SOURCE)) return;

  mapInstance.addSource(FLEET_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster,
    clusterMaxZoom: 12,
    clusterRadius: 52,
  });

  if (cluster) {
    mapInstance.addLayer({
      id: FLEET_CLUSTER,
      type: 'circle',
      source: FLEET_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#3b82f6',
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    mapInstance.addLayer({
      id: FLEET_CLUSTER_COUNT,
      type: 'symbol',
      source: FLEET_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 12,
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      },
      paint: { 'text-color': '#ffffff' },
    });
  }

  mapInstance.addLayer({
    id: FLEET_UNCLUSTERED,
    type: 'circle',
    source: FLEET_SOURCE,
    filter: cluster ? ['!', ['has', 'point_count']] : undefined,
    paint: {
      'circle-radius': ['case', ['==', ['get', 'selected'], 1], 9, 7],
      'circle-color': ['get', 'color'],
      'circle-opacity': [
        'case',
        ['==', ['get', 'offline'], 1],
        0.4,
        0.95,
      ],
      'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 4, 2],
      'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#0f172a', '#ffffff'],
    },
  });

  // Additive symbol layer — rotates with `heading` without recreating DOM markers.
  try {
    ensureHeadingArrowImage(mapInstance);
    mapInstance.addLayer({
      id: FLEET_HEADING,
      type: 'symbol',
      source: FLEET_SOURCE,
      filter: cluster
        ? [
            'all',
            ['!', ['has', 'point_count']],
            ['==', ['get', 'hasHeading'], 1],
            ['!=', ['get', 'offline'], 1],
          ]
        : ['all', ['==', ['get', 'hasHeading'], 1], ['!=', ['get', 'offline'], 1]],
      layout: {
        'icon-image': FLEET_HEADING_IMAGE,
        'icon-size': 0.45,
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-offset': [0, -10],
      },
      paint: {
        'icon-opacity': 0.85,
      },
    });
  } catch {
    // Heading layer is best-effort — circle markers remain the primary hit target.
  }
}

function collectSymbolLayerIds(mapInstance: mapboxgl.Map): string[] {
  const style = mapInstance.getStyle();
  if (!style?.layers) return [];
  return style.layers
    .filter((layer) => layer.type === 'symbol')
    .map((layer) => layer.id)
    .filter((id) => !id.startsWith('fleet-') && id !== FLEET_CLUSTER_COUNT);
}

function applyLabelVisibility(
  mapInstance: mapboxgl.Map,
  layerIds: string[],
  visible: boolean,
): void {
  for (const id of layerIds) {
    if (!mapInstance.getLayer(id)) continue;
    try {
      mapInstance.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    } catch {
      // style may not support this layer id after swap
    }
  }
}

function applyTrafficLayer(mapInstance: mapboxgl.Map, enabled: boolean): void {
  try {
    if (enabled) {
      if (!mapInstance.getSource(TRAFFIC_SOURCE)) {
        mapInstance.addSource(TRAFFIC_SOURCE, {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1',
        });
      }
      if (!mapInstance.getLayer(TRAFFIC_LAYER)) {
        mapInstance.addLayer({
          id: TRAFFIC_LAYER,
          type: 'line',
          source: TRAFFIC_SOURCE,
          'source-layer': 'traffic',
          paint: {
            'line-width': 2,
            'line-color': [
              'match',
              ['get', 'congestion'],
              'low',
              '#22c55e',
              'moderate',
              '#f59e0b',
              'heavy',
              '#ef4444',
              'severe',
              '#7f1d1d',
              '#94a3b8',
            ],
            'line-opacity': 0.75,
          },
        });
      } else {
        mapInstance.setLayoutProperty(TRAFFIC_LAYER, 'visibility', 'visible');
      }
    } else if (mapInstance.getLayer(TRAFFIC_LAYER)) {
      mapInstance.setLayoutProperty(TRAFFIC_LAYER, 'visibility', 'none');
    }
  } catch {
    // style may not support traffic vectors — fail softly
  }
}

function upsertEndpointMarker(
  mapInstance: mapboxgl.Map,
  existing: mapboxgl.Marker | null,
  lngLat: [number, number],
  label: string,
  color: string,
): mapboxgl.Marker {
  if (existing) {
    existing.setLngLat(lngLat);
    return existing;
  }
  const el = document.createElement('div');
  el.title = label;
  el.setAttribute('aria-label', label);
  el.style.width = '14px';
  el.style.height = '14px';
  el.style.borderRadius = '999px';
  el.style.background = color;
  el.style.border = '2px solid white';
  el.style.boxShadow = '0 1px 4px rgba(15,23,42,0.35)';
  return new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(mapInstance);
}

function emptyLine(): {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
} {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [] },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getMarkerSVG(vehicle: TrackingVehicle, selected: boolean): string {
  const color = movementMarkerColor(vehicle.movementState);
  const rotation = vehicle.heading ?? 0;
  const size = selected ? 44 : 32;
  const opacity =
    vehicle.isStale || vehicle.movementState === 'OFFLINE' ? 0.45 : 1;
  const ring = selected
    ? `<circle cx="16" cy="16" r="15.5" fill="none" stroke="#0f172a" stroke-width="2.5" opacity="0.85" />`
    : '';

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${rotation}deg); opacity: ${opacity}; transition: transform 280ms ease-out">
      <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.3" />
      ${ring}
      <circle cx="16" cy="16" r="8" fill="${color}" stroke="white" stroke-width="2" />
      <path d="M16 8 L20 14 L16 12 L12 14 Z" fill="white" />
    </svg>
  `;
}
