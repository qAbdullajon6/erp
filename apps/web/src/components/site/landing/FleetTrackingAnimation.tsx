import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { X, Truck, Navigation, Clock, Package, User, ChevronRight, MapPin } from "lucide-react";

// ─── Truck data ───────────────────────────────────────────────────────────────

interface TruckDef {
  id: string; driver: string; cargo: string;
  origin: string; dest: string;
  speedMph: number; color: string;
  start: [number, number];
  end: [number, number];
  fallback: [number, number][];
}

const TRUCKS: TruckDef[] = [
  {
    id: "FL-001", driver: "James Wilson", cargo: "Electronics",
    origin: "New York, NY", dest: "Boston, MA",
    speedMph: 65, color: "#F97316",
    start: [-74.006, 40.712], end: [-71.057, 42.361],
    fallback: [[-74.006,40.712],[-73.858,41.003],[-73.510,41.155],[-72.925,41.303],[-71.863,41.825],[-71.057,42.361]],
  },
  {
    id: "FL-002", driver: "Elena Reyes", cargo: "Auto Parts",
    origin: "Los Angeles, CA", dest: "San Francisco, CA",
    speedMph: 70, color: "#FB923C",
    start: [-118.243, 34.052], end: [-122.418, 37.775],
    fallback: [[-118.243,34.052],[-118.100,34.520],[-119.020,35.370],[-120.200,36.980],[-121.700,37.640],[-122.418,37.775]],
  },
  {
    id: "FL-003", driver: "Robert Chen", cargo: "Fresh Produce",
    origin: "Chicago, IL", dest: "St. Louis, MO",
    speedMph: 68, color: "#FDBA74",
    start: [-87.629, 41.878], end: [-90.199, 38.627],
    fallback: [[-87.629,41.878],[-88.040,41.390],[-88.960,40.360],[-89.300,39.980],[-90.050,38.890],[-90.199,38.627]],
  },
  {
    id: "FL-004", driver: "Sarah Johnson", cargo: "Medical Supplies",
    origin: "Dallas, TX", dest: "Houston, TX",
    speedMph: 72, color: "#EA580C",
    start: [-96.797, 32.776], end: [-95.370, 29.760],
    fallback: [[-96.797,32.776],[-96.470,32.200],[-96.110,31.530],[-95.830,30.980],[-95.370,29.760]],
  },
  {
    id: "FL-005", driver: "David Park", cargo: "Furniture",
    origin: "Miami, FL", dest: "Atlanta, GA",
    speedMph: 64, color: "#C2410C",
    start: [-80.191, 25.774], end: [-84.388, 33.749],
    fallback: [[-80.191,25.774],[-80.220,26.720],[-81.000,28.510],[-81.560,30.010],[-82.400,31.480],[-83.680,32.540],[-84.388,33.749]],
  },
];

// ─── Fetch real road geometry from OSRM ──────────────────────────────────────

async function fetchRoadRoute(
  start: [number, number],
  end: [number, number],
): Promise<[number, number][] | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${start[0]},${start[1]};${end[0]},${end[1]}` +
      `?geometries=geojson&overview=full`;
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    const json = await res.json();
    if (json.routes?.[0]?.geometry?.coordinates?.length) {
      return json.routes[0].geometry.coordinates as [number, number][];
    }
  } catch {
    // timeout / network blocked → use fallback
  }
  return null;
}

// ─── Navigation arrow icon (per-truck color) ──────────────────────────────────

function makeNavIcon(color: string, size = 52): { width: number; height: number; data: Uint8ClampedArray } {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  const r  = size * 0.38;

  // Soft outer glow ring
  const grd = ctx.createRadialGradient(cx, cy - r * 0.2, 0, cx, cy, r + 6);
  grd.addColorStop(0, color + "50");
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fill();

  // Arrow body (chevron/teardrop, pointing UP = north)
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur  = 4;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.moveTo(cx,           cy - r);           // front tip
  ctx.bezierCurveTo(
    cx + r * 0.68, cy - r * 0.10,            // right shoulder
    cx + r * 0.56, cy + r * 0.54,            // right base
    cx,            cy + r * 0.30,             // rear notch
  );
  ctx.bezierCurveTo(
    cx - r * 0.56, cy + r * 0.54,            // left base
    cx - r * 0.68, cy - r * 0.10,            // left shoulder
    cx,            cy - r,                    // front tip
  );
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // White outline
  ctx.strokeStyle = "rgba(255,255,255,0.90)";
  ctx.lineWidth   = 1.8;
  ctx.stroke();

  // Inner gloss highlight
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(cx,           cy - r * 0.80);
  ctx.bezierCurveTo(
    cx + r * 0.34, cy - r * 0.22,
    cx + r * 0.24, cy + r * 0.16,
    cx,            cy + r * 0.06,
  );
  ctx.bezierCurveTo(
    cx - r * 0.24, cy + r * 0.16,
    cx - r * 0.34, cy - r * 0.22,
    cx,            cy - r * 0.80,
  );
  ctx.fill();

  const id = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8ClampedArray(id.data) };
}

// ─── Route geometry helpers ───────────────────────────────────────────────────

function cumLens(route: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < route.length; i++) {
    const dx = route[i][0] - route[i - 1][0];
    const dy = route[i][1] - route[i - 1][1];
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
}

function posAt(
  route: [number, number][],
  segs: number[],
  t: number,
): { lng: number; lat: number; bearing: number } {
  const total = segs[segs.length - 1];
  let rem = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < route.length; i++) {
    const len = segs[i] - segs[i - 1];
    if (rem <= len || i === route.length - 1) {
      const f = len > 0 ? Math.min(1, rem / len) : 0;
      const lng = route[i - 1][0] + (route[i][0] - route[i - 1][0]) * f;
      const lat = route[i - 1][1] + (route[i][1] - route[i - 1][1]) * f;
      const dx  = route[i][0] - route[i - 1][0];
      const dy  = route[i][1] - route[i - 1][1];
      return { lng, lat, bearing: (Math.atan2(dx, dy) * 180) / Math.PI };
    }
    rem -= len;
  }
  const last = route[route.length - 1];
  return { lng: last[0], lat: last[1], bearing: 0 };
}

function sliceTo(
  route: [number, number][],
  segs: number[],
  t: number,
): [number, number][] {
  const total = segs[segs.length - 1];
  let rem = Math.max(0, Math.min(1, t)) * total;
  const out: [number, number][] = [route[0]];
  for (let i = 1; i < route.length; i++) {
    const len = segs[i] - segs[i - 1];
    if (rem <= len) {
      const f = len > 0 ? rem / len : 0;
      out.push([
        route[i - 1][0] + (route[i][0] - route[i - 1][0]) * f,
        route[i - 1][1] + (route[i][1] - route[i - 1][1]) * f,
      ]);
      return out;
    }
    out.push(route[i]);
    rem -= len;
  }
  return out;
}

// Demo speed: 1 real driving hour = 100 s on screen
function demoDurationMs(segs: number[], speedMph: number): number {
  const miles = segs[segs.length - 1] * 68.7;
  return (miles / speedMph) * 100_000;
}

// ─── Map style ────────────────────────────────────────────────────────────────

function makeMapStyle(dark: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      "carto-dark": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
        maxzoom: 20,
      },
      "carto-light": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: "layer-dark",
        type: "raster",
        source: "carto-dark",
        paint: { "raster-saturation": -0.10, "raster-brightness-max": 0.88 },
        layout: { visibility: dark ? "visible" : "none" },
      },
      {
        id: "layer-light",
        type: "raster",
        source: "carto-light",
        paint: { "raster-saturation": -0.05 },
        layout: { visibility: dark ? "none" : "visible" },
      },
    ],
  };
}

// North America overview — Mexico to Canada visible
const OVERVIEW = { center: [-96.0, 38.5] as [number, number], zoom: 3.0 };

// ─── Component ────────────────────────────────────────────────────────────────

export function FleetTrackingAnimation() {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<maplibregl.Map | null>(null);
  const rafRef         = useRef<number>(0);
  const lastRef        = useRef<number | null>(null);
  const observerRef    = useRef<MutationObserver | null>(null);
  const routesRef      = useRef<[number, number][][]>(TRUCKS.map(t => t.fallback));
  const segsRef        = useRef<number[][]>([]);
  const durRef         = useRef<number[]>([]);
  const progsRef       = useRef<number[]>(TRUCKS.map((_, i) => i / TRUCKS.length));
  const selectedRef    = useRef<number | null>(null);

  const [phase,     setPhase]     = useState<"loading" | "ready">("loading");
  const [loadMsg,   setLoadMsg]   = useState("Connecting to map…");
  const [selIdx,    setSelIdx]    = useState<number | null>(null);
  const [panelProg, setPanelProg] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function init() {
      // ── 1. Fetch real road routes (parallel) ───────────────────────────
      setLoadMsg("Fetching road routes…");
      const fetched = await Promise.all(
        TRUCKS.map(async (t, i) => {
          const coords = await fetchRoadRoute(t.start, t.end);
          return coords ?? t.fallback;
        }),
      );
      if (cancelled) return;
      routesRef.current = fetched;

      // ── 2. Pre-compute route lengths and durations ─────────────────────
      segsRef.current = fetched.map(cumLens);
      durRef.current  = TRUCKS.map((t, i) => demoDurationMs(segsRef.current[i], t.speedMph));

      // ── 3. Init map ────────────────────────────────────────────────────
      setLoadMsg("Loading map tiles…");
      const initDark = document.documentElement.classList.contains("dark");
      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: makeMapStyle(initDark),
        center: OVERVIEW.center,
        zoom: OVERVIEW.zoom,
        interactive: true,
        attributionControl: false,
        minZoom: 2,
        maxZoom: 16,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;

      await new Promise<void>((res) => map.on("load", res));
      if (cancelled) return;

      // ── 4a. Live theme switching via MutationObserver ─────────────────────
      const themeObserver = new MutationObserver(() => {
        const dark = document.documentElement.classList.contains("dark");
        map.setLayoutProperty("layer-dark",  "visibility", dark ? "visible" : "none");
        map.setLayoutProperty("layer-light", "visibility", dark ? "none" : "visible");
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      observerRef.current = themeObserver;

      // ── 4. Add truck icons (one colored icon per truck) ────────────────
      TRUCKS.forEach((t, i) => {
        const img = makeNavIcon(t.color, 52);
        map.addImage(`nav-${i}`, img);
      });

      // ── 5. Full route lines (hidden) ────────────────────────────────────
      map.addSource("routes-full", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: routesRef.current.map((r, i) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: r },
            properties: { color: TRUCKS[i].color, idx: i },
          })),
        },
      });
      map.addLayer({
        id: "rf-glow", type: "line", source: "routes-full",
        paint: { "line-color": ["get","color"], "line-width": 10, "line-opacity": 0.18, "line-blur": 6 },
        layout: { "line-join":"round","line-cap":"round", visibility:"none" },
      });
      map.addLayer({
        id: "rf-line", type: "line", source: "routes-full",
        paint: { "line-color": ["get","color"], "line-width": 2, "line-opacity": 0.35, "line-dasharray":[5,4] },
        layout: { "line-join":"round","line-cap":"round", visibility:"none" },
      });

      // ── 6. Traveled segment (hidden) ────────────────────────────────────
      map.addSource("route-done", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "rd-glow", type: "line", source: "route-done",
        paint: { "line-color": ["get","color"], "line-width": 12, "line-opacity": 0.22, "line-blur": 8 },
        layout: { "line-join":"round","line-cap":"round", visibility:"none" },
      });
      map.addLayer({
        id: "rd-line", type: "line", source: "route-done",
        paint: { "line-color": ["get","color"], "line-width": 3.5, "line-opacity": 1 },
        layout: { "line-join":"round","line-cap":"round", visibility:"none" },
      });

      // ── 7. Start/end markers (hidden) ────────────────────────────────────
      map.addSource("endpoints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ep-ring", type: "circle", source: "endpoints",
        paint: { "circle-radius": 10, "circle-color": ["get","color"], "circle-opacity": 0.18 },
        layout: { visibility: "none" },
      });
      map.addLayer({
        id: "ep-dot", type: "circle", source: "endpoints",
        paint: {
          "circle-radius": 5.5,
          "circle-color": ["get","color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
        layout: { visibility: "none" },
      });

      // ── 8. Truck symbols ──────────────────────────────────────────────────
      map.addSource("trucks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "trucks-icon",
        type: "symbol",
        source: "trucks",
        paint: { "icon-opacity": 1 },
        layout: {
          "icon-image": ["get", "iconName"],
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            2.5, 0.38,
            5,   0.55,
            8,   0.80,
            12,  1.10,
          ],
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      // ── 9. Interaction ────────────────────────────────────────────────────
      map.on("mouseenter", "trucks-icon", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "trucks-icon", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "trucks-icon", (e) => {
        const props = e.features?.[0]?.properties;
        if (props == null) return;
        selectTruck(map, props.index as number);
      });
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["trucks-icon"] });
        if (!hits.length && selectedRef.current !== null) deselect(map);
      });

      // ── 10. Animation loop ────────────────────────────────────────────────
      if (cancelled) { map.remove(); return; }
      setPhase("ready");

      let routeTimer = 0;

      function frame(now: number) {
        if (!lastRef.current) lastRef.current = now;
        const dt = Math.min(now - lastRef.current, 64);
        lastRef.current = now;

        progsRef.current = progsRef.current.map((p, i) =>
          (p + dt / durRef.current[i]) % 1,
        );

        (map.getSource("trucks") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: routesRef.current.map((r, i) => {
            const { lng, lat, bearing } = posAt(r, segsRef.current[i], progsRef.current[i]);
            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [lng, lat] },
              properties: { index: i, iconName: `nav-${i}`, bearing },
            };
          }),
        });

        routeTimer += dt;
        if (routeTimer > 450 && selectedRef.current !== null) {
          routeTimer = 0;
          const idx = selectedRef.current;
          const prog = progsRef.current[idx];
          (map.getSource("route-done") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: { type: "LineString", coordinates: sliceTo(routesRef.current[idx], segsRef.current[idx], prog) },
              properties: { color: TRUCKS[idx].color },
            }],
          });
        }

        rafRef.current = requestAnimationFrame(frame);
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    init().catch(console.error);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      observerRef.current?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Select / deselect helpers ──────────────────────────────────────────────

  function selectTruck(map: maplibregl.Map, idx: number) {
    selectedRef.current = idx;
    setSelIdx(idx);

    // Show routes for this truck only
    const truckFilter: maplibregl.ExpressionSpecification = ["==", ["get","idx"], idx];
    map.setFilter("rf-glow", truckFilter);
    map.setFilter("rf-line", truckFilter);
    for (const id of ["rf-glow","rf-line","rd-glow","rd-line","ep-ring","ep-dot"])
      map.setLayoutProperty(id, "visibility", "visible");

    // Endpoint markers
    const t = TRUCKS[idx];
    const route = routesRef.current[idx];
    ;(map.getSource("endpoints") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [
        { type:"Feature", geometry:{type:"Point",coordinates:route[0]},              properties:{color:"#94A3B8"} },
        { type:"Feature", geometry:{type:"Point",coordinates:route[route.length-1]}, properties:{color:t.color} },
      ],
    });

    // Fly to current truck position
    const { lng, lat } = posAt(route, segsRef.current[idx], progsRef.current[idx]);
    map.flyTo({ center:[lng, lat], zoom: 8, speed: 1.4 });
  }

  function deselect(map: maplibregl.Map) {
    selectedRef.current = null;
    setSelIdx(null);
    for (const id of ["rf-glow","rf-line","rd-glow","rd-line","ep-ring","ep-dot"])
      map.setLayoutProperty(id, "visibility", "none");
    ;(map.getSource("route-done") as maplibregl.GeoJSONSource)
      .setData({ type:"FeatureCollection", features:[] });
    ;(map.getSource("endpoints") as maplibregl.GeoJSONSource)
      .setData({ type:"FeatureCollection", features:[] });
    map.flyTo({ ...OVERVIEW, speed: 1.2 });
  }

  // ── Panel progress ticker ──────────────────────────────────────────────────

  useEffect(() => {
    if (selIdx === null) { setPanelProg(0); return; }
    const id = setInterval(() => setPanelProg(progsRef.current[selIdx]), 500);
    return () => clearInterval(id);
  }, [selIdx]);

  // ── Follow selected truck ──────────────────────────────────────────────────

  useEffect(() => {
    if (selIdx === null) return;
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      const { lng, lat } = posAt(
        routesRef.current[selIdx],
        segsRef.current[selIdx],
        progsRef.current[selIdx],
      );
      map.easeTo({ center: [lng, lat], duration: 1400 });
    }, 3000);
    return () => clearInterval(id);
  }, [selIdx]);

  // ── Derived panel values ───────────────────────────────────────────────────

  const truck  = selIdx !== null ? TRUCKS[selIdx] : null;
  const etaMin = truck
    ? Math.max(1, Math.round(((1 - panelProg) * durRef.current[selIdx!]) / 100_000 * 60))
    : 0;

  return (
    <div
      className="relative w-full max-w-5xl mx-auto overflow-hidden rounded-3xl
        border border-black/[0.08] dark:border-white/[0.08]
        shadow-[0_8px_32px_rgba(0,0,0,0.10)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
    >
      {/* Map canvas */}
      <div ref={containerRef} style={{ height: 520 }} />

      {/* Loading overlay */}
      <AnimatePresence>
        {phase === "loading" && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.7 } }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3
              bg-[oklch(0.96_0.003_75)] dark:bg-[#09111E]"
          >
            <div
              className="h-9 w-9 animate-spin rounded-full"
              style={{ border: "2.5px solid rgba(249,115,22,0.22)", borderTopColor: "#F97316" }}
            />
            <p className="text-sm text-muted-foreground">{loadMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-3
          backdrop-blur-md border-b
          bg-white/90 border-black/[0.07]
          dark:bg-[rgba(9,17,30,0.86)] dark:border-white/[0.07]"
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-55"
              style={{ backgroundColor: "#F97316" }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#F97316" }} />
          </span>
          <span className="text-sm font-semibold text-foreground">FlowERP · Fleet Tracker</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "rgba(249,115,22,0.15)", color: "#F97316" }}>LIVE</span>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {TRUCKS.length} active trucks · click a truck for details
        </p>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {truck && selIdx !== null && (
          <motion.aside
            key="panel"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute bottom-6 left-5 z-30 w-[272px] overflow-hidden rounded-2xl
              backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.18)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.65)]
              bg-white/95 dark:bg-[rgba(9,17,30,0.94)]"
            style={{ border: `1px solid ${truck.color}38` }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background:`${truck.color}18`, border:`1px solid ${truck.color}35` }}>
                  <Truck className="h-4 w-4" style={{ color: truck.color }} />
                </div>
                <div>
                  <p className="text-[13px] font-bold leading-none text-foreground">{truck.id}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    En route · {truck.speedMph} mph
                  </p>
                </div>
              </div>
              <button
                onClick={() => { const m = mapRef.current; if (m) deselect(m); }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground
                  transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Route */}
            <div className="px-4 py-4 border-b border-black/[0.06] dark:border-white/[0.07]">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-muted-foreground">Route</p>
                  <p className="text-[13px] font-medium text-foreground">{truck.origin}</p>
                  <div className="my-2 flex items-center gap-1.5">
                    <div className="h-px flex-1"
                      style={{ background:`linear-gradient(90deg, ${truck.color}bb, transparent)` }} />
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: truck.color }} />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">{truck.dest}</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.07]">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width:`${(panelProg*100).toFixed(1)}%`,
                    background:`linear-gradient(90deg, ${truck.color}, ${truck.color}88)` }} />
              </div>
              <p className="mt-1 text-right text-[11px] text-muted-foreground">
                {Math.round(panelProg*100)}% complete
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2">
              {[
                { icon: Navigation, label:"Speed",  value:`${truck.speedMph} mph` },
                { icon: Clock,      label:"ETA",    value:`${etaMin} min` },
                { icon: User,       label:"Driver", value: truck.driver },
                { icon: Package,    label:"Cargo",  value: truck.cargo },
              ].map(({ icon:Icon, label, value }, i) => (
                <div key={label}
                  className={[
                    "flex flex-col gap-0.5 px-4 py-3.5",
                    i % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : "",
                    i >= 2 ? "border-t border-black/[0.05] dark:border-white/[0.05]" : "",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Icon className="h-3 w-3" /> {label}
                  </span>
                  <span className="truncate text-[13px] font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

<div className="absolute bottom-2 right-14 z-10 text-[10px] text-muted-foreground opacity-50">
        © OpenStreetMap · © CARTO
      </div>
    </div>
  );
}
