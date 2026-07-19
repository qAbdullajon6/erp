import {
  Package,
  Route,
  Truck,
  Wallet,
  Users,
  BarChart3,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading, Card, IconTile, Pill } from "./primitives";
import { Reveal, useInView } from "./motion";
import { cn } from "@/lib/utils";

const MODULES: { icon: LucideIcon; name: string; desc: string }[] = [
  { icon: Package, name: "Orders", desc: "Capture, price, and route every shipment from one queue." },
  { icon: Route, name: "Dispatch", desc: "AI-optimized assignment across your live, available fleet." },
  { icon: Truck, name: "Fleet", desc: "Vehicles, drivers, maintenance, and utilization in real time." },
  { icon: Wallet, name: "Finance", desc: "Invoices and receivables reconcile to real deliveries." },
  { icon: Users, name: "Customers", desc: "Every account with full delivery and communication history." },
  { icon: BarChart3, name: "Reports", desc: "Operational and financial analytics, exportable in a click." },
];

export function Platform() {
  const sectionRef = useSectionVisibility("platform");

  return (
    <Section id="platform" sectionRef={sectionRef} width="wide" bordered={false}>
      <SectionHeading
        eyebrow="The platform"
        title="One system for every part of your operation"
        lead="Six modules on a single live data model. Update a delivery once and dispatch, finance, and the customer portal all move together — no spreadsheets, no re-keying, no drift."
      />

      {/* two feature tiles */}
      <div className="mt-16 grid gap-4 lg:grid-cols-2">
        <Reveal className="h-full">
          <Card className="flex h-full flex-col overflow-hidden p-8">
            <div className="flex items-center gap-3">
              <IconTile>
                <Route className="h-5 w-5" />
              </IconTile>
              <h3 className="text-lg font-semibold text-foreground">One live data model</h3>
            </div>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Orders, fleet, finance and CRM read and write the same source of truth. Everything you
              see is the operation as it is right now.
            </p>
            <div className="mt-6 flex flex-1 items-center justify-center">
              <NetworkDiagram />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={80} className="h-full">
          <Card className="flex h-full flex-col overflow-hidden p-8">
            <div className="flex items-center gap-3">
              <IconTile>
                <Sparkles className="h-5 w-5" />
              </IconTile>
              <h3 className="text-lg font-semibold text-foreground">AI on every screen</h3>
            </div>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              The copilot understands your whole operation. Ask in plain language, get an answer
              grounded in live data — and let it take the next step.
            </p>
            <CopilotTeaser />
          </Card>
        </Reveal>
      </div>

      {/* module grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m, i) => (
          <Reveal key={m.name} delay={i * 60}>
            <Card interactive className="group h-full p-6">
              <div className="flex items-center gap-3">
                <IconTile>
                  <m.icon className="h-5 w-5" />
                </IconTile>
                <h3 className="text-base font-semibold text-foreground">{m.name}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-10 flex flex-col items-center gap-4 text-center">
        <Pill tone="brand">
          <Sparkles className="h-3.5 w-3.5" />
          All modules share one live data model — nothing ever goes out of sync
        </Pill>
        <a
          href="#ai"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand/80"
        >
          See the AI copilot in action
          <ArrowRight className="h-4 w-4" />
        </a>
      </Reveal>
    </Section>
  );
}

/** Central hub + module satellites with connecting lines that draw in on view. */
function NetworkDiagram() {
  const [ref, inView] = useInView<SVGSVGElement>({ once: true });
  const nodes = [
    { x: 60, y: 40, label: "Orders" },
    { x: 300, y: 40, label: "Fleet" },
    { x: 40, y: 120, label: "Finance" },
    { x: 320, y: 120, label: "CRM" },
    { x: 90, y: 190, label: "Dispatch" },
    { x: 270, y: 190, label: "Reports" },
  ];
  const cx = 180;
  const cy = 115;

  return (
    <svg
      ref={ref}
      viewBox="0 0 360 230"
      className="h-auto w-full max-w-md text-brand"
      role="img"
      aria-label="Modules connected to a single live data core"
    >
      {nodes.map((n, i) => {
        const len = Math.hypot(n.x - cx, n.y - cy) + 4;
        return (
          <line
            key={n.label}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            className={cn("lv2-draw", inView && "is-in")}
            style={{ ["--lv2-len" as string]: len, animationDelay: `${i * 120}ms` }}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1.4}
          />
        );
      })}

      {nodes.map((n) => (
        <g key={`node-${n.label}`}>
          <circle cx={n.x} cy={n.y} r={4} fill="currentColor" fillOpacity={0.9} />
          <text
            x={n.x}
            y={n.y - 10}
            textAnchor="middle"
            className="fill-muted-foreground font-sans text-[10px]"
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* core */}
      <circle cx={cx} cy={cy} r={26} className="fill-brand/10" stroke="currentColor" strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={26} className="lv2-pulse-ring fill-none stroke-brand" style={{ transformOrigin: `${cx}px ${cy}px` }} strokeWidth={1} />
      <text x={cx} y={cy - 1} textAnchor="middle" className="fill-foreground font-sans text-[9px] font-semibold">
        FlowERP
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground font-sans text-[8px]">
        core
      </text>
    </svg>
  );
}

function CopilotTeaser() {
  return (
    <div className="mt-6 flex flex-1 flex-col justify-end gap-2.5" aria-hidden>
      <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-muted/60 px-3.5 py-2 text-xs font-medium text-foreground">
        Draft this month's invoices for Alfa Trade
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-brand/25 bg-brand/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-foreground/90">
        Prepared 3 invoices totaling <span className="font-semibold text-foreground">$12,480</span> from
        delivered orders. Ready to review and send.
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
        <span className="flex-1 truncate text-xs text-muted-foreground/70">Ask the copilot anything…</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
