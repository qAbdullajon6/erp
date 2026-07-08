import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { ArrowRight, Truck, MapPin, Package, DollarSign } from "lucide-react";

export function Hero() {
  const scrollToWorkflow = () => {
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden bg-background">
      {/* Enhanced hero glow backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />

      {/* Subtle grid pattern */}
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(oklch(1_0_0_/_0.02)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0_/_0.02)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          {/* Subtle badge with enhanced styling */}
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand/30 bg-surface/80 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span>AI-native logistics ERP · Built for modern fleets</span>
          </div>

          {/* Enhanced hero heading with better spacing */}
          <h1 className="mt-8 font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:mt-10 sm:text-5xl md:text-6xl lg:text-7xl">
            Run Every Delivery
            <br className="hidden sm:block" /> From One{" "}
            <span className="block text-gradient-brand mt-2 sm:inline sm:mt-0">Intelligent Command Center</span>
          </h1>

          {/* Enhanced description with better color */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl md:leading-relaxed">
            FlowERP AI unifies orders, dispatch, tracking, fleet, and finance into one modern platform — with an AI assistant that answers operational questions in seconds.
          </p>

          {/* Enhanced CTA buttons with better visual hierarchy */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:mt-12 sm:flex-row">
            <Button
              onClick={openDemoModal}
              size="lg"
              className="relative h-13 px-8 font-semibold bg-gradient-brand text-brand-foreground shadow-brand hover:shadow-brand hover:opacity-95 transition-all duration-200 group"
            >
              <span className="flex items-center gap-2">
                Request a Personalized Demo
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
            <Button
              onClick={scrollToWorkflow}
              size="lg"
              className="h-13 px-8 font-semibold border-2 border-brand/40 bg-surface/50 text-foreground hover:bg-surface hover:border-brand/60 transition-all duration-200"
            >
              See How It Works
            </Button>
          </div>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto mt-20 max-w-6xl px-6 md:px-0">
      {/* Enhanced glow backdrop for the preview */}
      <div className="absolute -inset-x-8 -inset-y-10 rounded-3xl bg-gradient-brand/15 blur-3xl" />

      {/* Premium dashboard card */}
      <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-surface shadow-elevated">
        {/* Browser chrome with enhanced styling */}
        <div className="flex items-center gap-2 border-b border-brand/15 bg-background/60 px-5 py-3.5 backdrop-blur">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning" />
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
          </div>
          <div className="ml-3 text-xs font-medium text-muted-foreground">app.flowerp.ai / command-center</div>
        </div>

        <div className="grid grid-cols-12 gap-4 p-6 bg-gradient-to-b from-background/80 to-background/40">
          {/* Enhanced Sidebar */}
          <aside className="col-span-2 hidden flex-col gap-1 rounded-lg border border-brand/15 bg-background/50 p-3 md:flex">
            {["Overview", "Orders", "Dispatch", "Tracking", "Fleet", "Finance", "AI"].map((l, i) => (
              <div
                key={l}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  i === 0
                    ? "bg-brand/20 text-foreground border border-brand/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="col-span-12 md:col-span-10">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPI icon={Package} label="Orders today" value="1,284" delta="+12%" tone="brand" />
              <KPI icon={Truck} label="Active fleet" value="86 / 92" delta="94%" tone="success" />
              <KPI icon={MapPin} label="On-time rate" value="97.4%" delta="+2.1%" tone="success" />
              <KPI icon={DollarSign} label="Revenue (wk)" value="$482K" delta="+8.6%" tone="warning" />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Enhanced dispatch map card */}
              <div className="col-span-2 rounded-lg border border-brand/20 bg-background/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live dispatch map</div>
                  <div className="text-[10px] font-medium text-success flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    86 vehicles moving
                  </div>
                </div>
                <div className="relative h-40 overflow-hidden rounded-md bg-[radial-gradient(circle_at_30%_40%,oklch(0.5_0.2_255/0.7),transparent_50%),radial-gradient(circle_at_70%_60%,oklch(0.4_0.15_200/0.5),transparent_50%)]">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" fill="none">
                    <path d="M20 130 Q 120 40 200 90 T 380 60" stroke="oklch(0.82 0.18 230)" strokeWidth="2" strokeDasharray="5 3" />
                    <path d="M40 30 Q 140 100 220 60 T 370 130" stroke="oklch(0.72 0.2 255)" strokeWidth="2" strokeDasharray="5 3" />
                    {[[60,120],[180,80],[300,70],[350,120],[120,40],[240,110]].map(([x,y],i) => (
                      <circle key={i} cx={x} cy={y} r="5" fill="oklch(0.82 0.18 230)" />
                    ))}
                  </svg>
                </div>
              </div>

              {/* Enhanced recent orders card */}
              <div className="rounded-lg border border-brand/20 bg-background/50 p-4">
                <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent orders</div>
                <div className="space-y-2 text-xs">
                  {[
                    { id: "ORD-2841", city: "Tashkent", s: "In transit", t: "success" },
                    { id: "ORD-2840", city: "Samarkand", s: "Delayed", t: "warning" },
                    { id: "ORD-2839", city: "Bukhara", s: "Delivered", t: "success" },
                    { id: "ORD-2838", city: "Namangan", s: "Assigned", t: "muted" },
                  ].map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-md bg-surface/50 border border-border/20 px-2.5 py-2 hover:bg-surface/70 transition-colors">
                      <div>
                        <div className="font-semibold text-foreground">{o.id}</div>
                        <div className="text-[10px] text-muted-foreground">{o.city}</div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                          o.t === "success"
                            ? "bg-success/20 text-success"
                            : o.t === "warning"
                            ? "bg-warning/20 text-warning"
                            : "bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        {o.s}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  delta,
  tone = "brand",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta: string;
  tone?: "brand" | "success" | "warning";
}) {
  const borderColor = {
    brand: "border-brand/25",
    success: "border-success/25",
    warning: "border-warning/25",
  }[tone];

  const bgColor = {
    brand: "bg-brand/8",
    success: "bg-success/8",
    warning: "bg-warning/8",
  }[tone];

  const iconColor = {
    brand: "text-brand/70",
    success: "text-success/70",
    warning: "text-warning/70",
  }[tone];

  const deltaColor = {
    brand: "text-brand font-semibold",
    success: "text-success font-semibold",
    warning: "text-warning font-semibold",
  }[tone];

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} bg-background/50 p-4 hover:bg-background/60 transition-colors`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="mt-3 font-display text-2xl font-bold text-foreground">{value}</div>
      <div className={`mt-1 text-[11px] ${deltaColor}`}>{delta}</div>
    </div>
  );
}
