import { CheckCircle2, Sparkles, Truck } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading, BrowserFrame, LiveDot } from "./primitives";
import { Reveal, useInView, usePrefersReducedMotion } from "./motion";
import { cn } from "@/lib/utils";

export function Dispatch() {
  const sectionRef = useSectionVisibility("dispatch");

  return (
    <Section id="dispatch" sectionRef={sectionRef} width="wide">
      <SectionHeading
        eyebrow="Dispatch"
        title="Dispatch that recomputes the moment reality changes"
        lead="The board is your single operational source of truth. Drop in an order, and FlowERP assigns the right driver, redraws the route, and updates every ETA — automatically, in real time."
      />

      <Reveal delay={80} className="mt-16">
        <BrowserFrame url="app.flowerp.ai/dispatch">
          <div className="grid gap-px bg-border/60 lg:grid-cols-[minmax(0,340px)_1fr]">
            <div className="bg-surface">
              <Board />
            </div>
            <div className="bg-background/40">
              <RouteMap />
            </div>
          </div>
        </BrowserFrame>
      </Reveal>
    </Section>
  );
}

/* --------------------------------------------------------------------- board */

type Order = { id: string; primary: string; secondary: string; tone?: "success" | "brand" };

const COLUMNS: { title: string; count: number; orders: Order[] }[] = [
  {
    title: "Unassigned",
    count: 2,
    orders: [
      { id: "#1042", primary: "Chilanzar → Yunusabad", secondary: "AI suggests: Dilshod", tone: "brand" },
      { id: "#1043", primary: "Depot → Sergeli", secondary: "AI suggests: Aziz", tone: "brand" },
    ],
  },
  {
    title: "En route",
    count: 2,
    orders: [
      { id: "#1038", primary: "Dilshod K.", secondary: "ETA 14:20", tone: "success" },
      { id: "#1040", primary: "Aziz R.", secondary: "ETA 14:45", tone: "success" },
    ],
  },
  {
    title: "Delivered",
    count: 1,
    orders: [{ id: "#1031", primary: "Umid T.", secondary: "13:05" }],
  },
];

function Board() {
  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Today's board</div>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
          <LiveDot />
          Live
        </span>
      </div>

      <div className="mt-4 grid flex-1 grid-cols-3 gap-3 lg:grid-cols-1">
        {COLUMNS.map((col) => (
          <div key={col.title} className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {col.title}
              </span>
              <span className="rounded-full bg-muted/60 px-1.5 text-[10px] font-medium text-muted-foreground">
                {col.count}
              </span>
            </div>
            <div className="space-y-2">
              {col.orders.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2.5 transition-colors hover:border-brand/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{order.id}</span>
        {order.tone === "success" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
        ) : order.tone === "brand" ? (
          <Sparkles className="h-3 w-3 text-brand" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      <div className="mt-1 truncate text-[11px] text-foreground/80">{order.primary}</div>
      <div
        className={cn(
          "mt-0.5 truncate text-[11px]",
          order.tone === "brand" ? "text-brand" : "text-muted-foreground",
        )}
      >
        {order.secondary}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- route map */

const ROUTES = [
  { id: "r1", d: "M64,236 C120,196 150,140 196,120 S296,72 344,112", len: 460, active: true },
  { id: "r2", d: "M64,236 C150,250 250,252 300,232 S420,240 452,196", len: 470 },
  { id: "r3", d: "M64,236 C112,172 214,120 262,64", len: 320 },
];

const STOPS = [
  { x: 196, y: 120 },
  { x: 344, y: 112 },
  { x: 300, y: 232 },
  { x: 452, y: 196 },
  { x: 262, y: 64 },
  { x: 388, y: 250 },
];

function RouteMap() {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<SVGSVGElement>({ once: true });

  return (
    <div className="relative h-full min-h-[300px] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Live route map</div>
        <span className="text-[11px] font-medium text-brand">3 routes · 22 stops</span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-background/50">
        <div aria-hidden className="lv2-grid-fine absolute inset-0 opacity-60" />
        <svg
          ref={ref}
          viewBox="0 0 500 300"
          className="relative block h-auto w-full text-brand"
          role="img"
          aria-label="Live delivery routes across the city"
        >
          {/* base routes */}
          {ROUTES.map((r, i) => (
            <path
              key={r.id}
              d={r.d}
              fill="none"
              stroke="currentColor"
              strokeOpacity={r.active ? 0.55 : 0.28}
              strokeWidth={r.active ? 2 : 1.5}
              strokeLinecap="round"
              className={cn("lv2-draw", inView && "is-in")}
              style={{ ["--lv2-len" as string]: r.len, animationDelay: `${i * 220}ms` }}
              id={r.active ? "lv2-route-active" : undefined}
            />
          ))}

          {/* flowing overlay on the active route */}
          <path
            d={ROUTES[0].d}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.9}
            strokeWidth={2}
            strokeLinecap="round"
            className="lv2-flow"
          />

          {/* stops */}
          {STOPS.map((s, i) => (
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={5} className="fill-background" stroke="currentColor" strokeWidth={1.6} strokeOpacity={0.7} />
              <circle cx={s.x} cy={s.y} r={2} fill="currentColor" fillOpacity={0.9} />
            </g>
          ))}

          {/* depot */}
          <g>
            <circle cx={64} cy={236} r={9} className="fill-brand/15" stroke="currentColor" strokeWidth={1.8} />
            <circle cx={64} cy={236} r={9} className="lv2-pulse-ring fill-none stroke-brand" style={{ transformOrigin: "64px 236px" }} strokeWidth={1.2} />
            <circle cx={64} cy={236} r={3} fill="currentColor" />
          </g>

          {/* moving vehicle along the active route */}
          <g>
            <circle r={6} className="fill-brand" stroke="var(--background)" strokeWidth={2} />
            {!reduced && (
              <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1">
                <mpath href="#lv2-route-active" />
              </animateMotion>
            )}
          </g>
        </svg>

        {/* eta chip */}
        <div className="absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur">
          <Truck className="h-3.5 w-3.5 text-brand" />
          <span className="font-medium text-foreground">Route 14</span>
          <span className="text-success">on time</span>
        </div>
      </div>
    </div>
  );
}
