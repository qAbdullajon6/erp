import {
  Package,
  Route,
  MapPin,
  Truck,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ReactNode } from "react";

export function Features() {
  return (
    <section id="features" className="relative border-t border-border/60 py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
            <Package className="h-3.5 w-3.5" />
            Platform
          </div>
          <h2 className="mt-5 font-display text-5xl font-bold tracking-tight text-foreground md:text-6xl">
            Everything Your Logistics Team Needs
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Six modules built to work as one. Real-time data flows across dispatch, tracking, finance, and AI — with no spreadsheets in between.
          </p>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={Package}
            title="Order Management"
            desc="Capture, assign, and track every shipment from a single queue."
          >
            <OrderPreview />
          </FeatureCard>

          <FeatureCard
            icon={Route}
            title="Smart Dispatch"
            desc="AI-optimized route assignment across your active fleet."
          >
            <DispatchPreview />
          </FeatureCard>

          <FeatureCard
            icon={MapPin}
            title="Live Tracking"
            desc="Real-time vehicle positions and ETA accuracy on every route."
          >
            <TrackingPreview />
          </FeatureCard>

          <FeatureCard
            icon={Truck}
            title="Fleet Management"
            desc="Vehicles, drivers, maintenance windows, and utilization in one view."
          >
            <FleetPreview />
          </FeatureCard>

          <FeatureCard
            icon={Wallet}
            title="Finance Control"
            desc="Invoices, receivables, and driver payouts synced to operations."
          >
            <FinancePreview />
          </FeatureCard>

          <FeatureCard
            icon={Sparkles}
            title="AI Assistant"
            desc="Ask any operational question in plain language — get answers instantly."
          >
            <AIPreview />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-surface/40 p-7 transition-all hover:-translate-y-1 hover:border-brand/40 hover:bg-surface hover:shadow-xl">
      {/* Hover glow effect */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand/20 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />

      <div className="relative">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand transition-transform group-hover:scale-110">
            <Icon className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
        <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-background/60 p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function OrderPreview() {
  const rows = [
    { id: "ORD-2841", city: "Tashkent", s: "In transit", t: "success" },
    { id: "ORD-2840", city: "Samarkand", s: "Delayed", t: "warning" },
    { id: "ORD-2839", city: "Bukhara", s: "Delivered", t: "success" },
  ];
  return (
    <div className="space-y-1.5 text-xs">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-md bg-surface/60 px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            <span className="font-medium">{r.id}</span>
            <span className="text-muted-foreground">· {r.city}</span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              r.t === "success" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
            }`}
          >
            {r.s}
          </span>
        </div>
      ))}
    </div>
  );
}

function DispatchPreview() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Auto-assignment</span>
        <span className="text-success">● Optimized</span>
      </div>
      {[
        { d: "Aziz K.", r: "Route 14", eff: 92 },
        { d: "Bekzod A.", r: "Route 07", eff: 86 },
        { d: "Sardor M.", r: "Route 21", eff: 78 },
      ].map((x) => (
        <div key={x.d} className="rounded-md bg-surface/60 px-2.5 py-2">
          <div className="flex justify-between">
            <span className="font-medium">{x.d}</span>
            <span className="text-muted-foreground">{x.r}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${x.eff}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrackingPreview() {
  return (
    <div className="relative h-32 overflow-hidden rounded-md bg-[radial-gradient(circle_at_30%_60%,oklch(0.35_0.12_255/0.5),transparent_60%)]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 128">
        <path d="M10 100 Q 80 20 160 70 T 290 40" stroke="oklch(0.78 0.14 240)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
        {[[40,90],[130,60],[210,55],[275,45]].map(([x,y],i)=>(
          <g key={i}>
            <circle cx={x} cy={y} r="6" fill="oklch(0.68 0.17 250 / 0.3)" />
            <circle cx={x} cy={y} r="3" fill="oklch(0.78 0.14 240)" />
          </g>
        ))}
      </svg>
      <div className="absolute bottom-2 left-2 rounded-md bg-background/70 px-2 py-1 text-[10px] backdrop-blur">
        ETA · <span className="text-success">on time</span>
      </div>
    </div>
  );
}

function FleetPreview() {
  return (
    <div className="space-y-2 text-xs">
      {[
        { v: "TRK-014", s: "Active", t: "success" },
        { v: "TRK-021", s: "Idle", t: "muted" },
        { v: "TRK-033", s: "Maintenance", t: "warning" },
      ].map((v) => (
        <div key={v.v} className="flex items-center justify-between rounded-md bg-surface/60 px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{v.v}</span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              v.t === "success"
                ? "bg-success/15 text-success"
                : v.t === "warning"
                ? "bg-warning/15 text-warning"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {v.s}
          </span>
        </div>
      ))}
    </div>
  );
}

function FinancePreview() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-end justify-between rounded-md bg-surface/60 p-2.5">
        <div>
          <div className="text-[10px] text-muted-foreground">Weekly revenue</div>
          <div className="font-display text-lg font-bold">$482,140</div>
        </div>
        <div className="text-[10px] text-success">+8.6%</div>
      </div>
      <div className="flex items-end gap-1 rounded-md bg-surface/60 p-2.5">
        {[40, 60, 50, 75, 55, 82, 90].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-gradient-brand" style={{ height: `${h * 0.5}px` }} />
        ))}
      </div>
      <div className="flex items-center justify-between rounded-md bg-surface/60 px-2.5 py-1.5">
        <span className="text-muted-foreground">Outstanding invoices</span>
        <span className="font-medium">14</span>
      </div>
    </div>
  );
}

function AIPreview() {
  return (
    <div className="space-y-2 text-xs">
      <div className="rounded-md bg-surface/60 px-2.5 py-2">
        <div className="text-[10px] text-muted-foreground">You</div>
        <div>How many deliveries are running late today?</div>
      </div>
      <div className="rounded-md border border-brand/30 bg-brand/10 px-2.5 py-2">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] text-brand">
          <Sparkles className="h-3 w-3" /> FlowERP AI
        </div>
        <div>7 shipments are delayed — mostly on Route 14. Want me to reassign 3 to available drivers?</div>
      </div>
    </div>
  );
}
