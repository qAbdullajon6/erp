'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  isMapboxPublicTokenConfigured,
  MAPBOX_PUBLIC_TOKEN,
  mapboxStyleUrl,
} from '@/lib/mapbox';

/// Default centre — Tashkent, shown when neither customer nor city coords exist.
const DEFAULT_CENTER = { lat: 41.2995, lng: 69.2401 };
const DEFAULT_ZOOM = 12;

export interface MapPickerCoords {
  lat: number;
  lng: number;
}

interface MapPickerProps {
  open: boolean;
  onClose: () => void;
  /// Starting position — use existing customer lat/lng (precise) or city-level
  /// coords (from Mapbox city suggestion). Null/undefined → DEFAULT_CENTER.
  initialCoords?: MapPickerCoords | null;
  onConfirm: (coords: MapPickerCoords) => void;
}

/// A Mapbox map in a Dialog that lets the user drop/drag a pin to pick an
/// exact lat/lng. Uses the public Mapbox token already configured for the
/// Fleet Tracking map — no new backend endpoint required.
export function MapPicker({ open, onClose, initialCoords, onConfirm }: MapPickerProps) {
  const hasToken = isMapboxPublicTokenConfigured();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingCoords, setPendingCoords] = useState<MapPickerCoords | null>(null);

  useEffect(() => {
    if (!open || !hasToken) return;

    // Capture the starting center at open time — intentionally not re-reactive
    // while the picker is open (user is actively moving the pin).
     
    const center = initialCoords ?? DEFAULT_CENTER;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let instance: any = null;
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    // Delay initialization to let the Dialog animation complete.
    // Radix Dialog scales/fades in over ~150ms; during that window the
    // container reports 0×0 and Mapbox silently bails out.
    initTimer = setTimeout(() => {
      if (cancelled || !containerRef.current) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      // CSS import is idempotent — safe to call multiple times.
      import('mapbox-gl/dist/mapbox-gl.css').catch(() => {});

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;

      instance = new mapboxgl.Map({
        container: containerRef.current,
        style: mapboxStyleUrl(),
        center: [center.lng, center.lat],
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });

      // Compact attribution so the footer is not cluttered
      instance.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-right',
      );

      setPendingCoords(center);

      // Default Mapbox pin with brand orange. The built-in SVG is more legible
      // than a custom CSS element and handles scale correctly out of the box.
      const marker = new mapboxgl.Marker({
        color: '#f59e0b',
        draggable: true,
      })
        .setLngLat([center.lng, center.lat])
        .addTo(instance);

      const updateCoords = () => {
        if (!cancelled) {
          const p = marker.getLngLat();
          setPendingCoords({ lat: p.lat, lng: p.lng });
        }
      };

      marker.on('drag', updateCoords);
      marker.on('dragend', updateCoords);

      // Click anywhere on the map to teleport the pin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instance.on('click', (e: any) => {
        if (cancelled) return;
        marker.setLngLat(e.lngLat);
        setPendingCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      // Extra resize pass after tiles load to handle any remaining size issues.
      resizeTimer = setTimeout(() => {
        if (!cancelled) instance?.resize();
      }, 300);
    }); // end import('mapbox-gl')
    }, 200); // end initTimer — waits for Dialog animation to settle

    return () => {
      cancelled = true;
      if (initTimer !== null) clearTimeout(initTimer);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      if (instance) {
        instance.remove();
        instance = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasToken]); // initialCoords intentionally excluded — captured at open time

  const handleConfirm = () => {
    if (pendingCoords) onConfirm(pendingCoords);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        data-testid="map-picker-dialog"
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        // Prevent stray Mapbox canvas events from closing the dialog.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        // Prevent Radix from returning focus to document.body on close.
        // Without this, focus leaves the parent Sheet → Sheet's onInteractOutside
        // fires → Sheet closes unexpectedly.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">Pick location on map</DialogTitle>
        </DialogHeader>

        {!hasToken ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">Map not configured</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Add a public Mapbox token (VITE_MAPBOX_ACCESS_TOKEN) to your .env.local to
              enable the map picker.
            </p>
          </div>
        ) : (
          <div className="relative shrink-0">
            <div ref={containerRef} className="h-[380px] w-full" />
            {/* Instruction hint — positioned above the Mapbox attribution */}
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
              <span className="rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm">
                Click the map or drag the pin to set the exact location
              </span>
            </div>
          </div>
        )}

        {/* Coordinate readout — informational, not for manual input */}
        {hasToken && pendingCoords && (
          <div className="shrink-0 border-t border-border/40 bg-muted/20 px-5 py-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              {pendingCoords.lat.toFixed(6)}°N &nbsp; {pendingCoords.lng.toFixed(6)}°E
            </p>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-border/60 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasToken || !pendingCoords}
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            Use this location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
