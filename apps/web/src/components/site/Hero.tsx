import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { ArrowRight, Truck, MapPin, Package, DollarSign } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { memo } from "react";

export function Hero() {
  const sectionRef = useSectionVisibility('hero');

  const scrollToWorkflow = () => {
    analytics.track({ name: 'hero_cta_click', params: { cta_text: 'See How It Works' } });
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDemoClick = () => {
    analytics.track({ name: 'hero_cta_click', params: { cta_text: 'Get a Demo' } });
    analytics.track({ name: 'book_demo_click', params: { source: 'hero' } });
    openDemoModal();
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      {/* Enhanced gradient glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand/20 via-brand/5 to-transparent opacity-60" />
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_50%_0%,oklch(0.68_0.17_250_/_0.15),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-28 pt-24 md:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Trusted by logistics companies across Central Asia
          </div>

          <h1 className="mt-6 font-display text-[44px] font-bold leading-[1.05] tracking-tight text-foreground sm:text-[56px] md:text-[64px]">
            Run Your Fleet Smarter{" "}
            <span className="text-gradient-brand">Save Time, Cut Costs, Deliver Faster</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Track every order, optimize routes with AI, and automate billing — all in one platform.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              onClick={handleDemoClick}
              size="lg"
              className="h-12 bg-gradient-brand px-6 text-brand-foreground shadow-brand hover:opacity-90"
            >
              Get a Demo
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button
              onClick={scrollToWorkflow}
              size="lg"
              variant="outline"
              className="h-12 border-border/60 bg-surface/40 px-6 text-foreground hover:bg-surface"
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

const HeroPreview = memo(function HeroPreview() {
  return (
    <div className="relative mx-auto mt-20 max-w-6xl min-h-[500px]" aria-hidden="true">
      {/* Enhanced glow effect */}
      <div className="absolute -inset-x-12 -inset-y-8 rounded-3xl bg-gradient-brand/30 blur-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-surface shadow-2xl">
        {/* Fake app chrome */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          </div>
          <div className="ml-3 text-xs text-muted-foreground">app.flowerp.ai / command-center</div>
        </div>

        <div className="grid grid-cols-12 gap-4 p-5">
          {/* Sidebar */}
          <aside className="col-span-2 hidden flex-col gap-1 rounded-lg border border-border/60 bg-background/40 p-3 md:flex">
            {["Overview", "Orders", "Dispatch", "Tracking", "Fleet", "Finance", "AI"].map((l, i) => (
              <div
                key={l}
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  i === 0 ? "bg-brand/15 text-foreground" : "text-muted-foreground"
                }`}
              >
                {l}
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="col-span-12 md:col-span-10">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPI icon={Package} label="Orders today" value="1,284" delta="+12%" />
              <KPI icon={Truck} label="Active fleet" value="86 / 92" delta="94%" tone="success" />
              <KPI icon={MapPin} label="On-time rate" value="97.4%" delta="+2.1%" tone="success" />
              <KPI icon={DollarSign} label="Revenue (wk)" value="$482K" delta="+8.6%" />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="col-span-2 rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">Live dispatch map</div>
                  <div className="text-[10px] text-success">● 86 vehicles moving</div>
                </div>
                <div className="relative h-40 overflow-hidden rounded-md bg-[radial-gradient(circle_at_30%_40%,oklch(0.35_0.12_255/0.6),transparent_50%),radial-gradient(circle_at_70%_60%,oklch(0.35_0.12_200/0.5),transparent_50%)]">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" fill="none">
                    <path d="M20 130 Q 120 40 200 90 T 380 60" stroke="oklch(0.78 0.14 240)" strokeWidth="1.5" strokeDasharray="4 4" />
                    <path d="M40 30 Q 140 100 220 60 T 370 130" stroke="oklch(0.68 0.17 250)" strokeWidth="1.5" strokeDasharray="4 4" />
                    {[[60,120],[180,80],[300,70],[350,120],[120,40],[240,110]].map(([x,y],i) => (
                      <circle key={i} cx={x} cy={y} r="4" fill="oklch(0.78 0.14 240)" />
                    ))}
                  </svg>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="mb-3 text-xs font-medium text-muted-foreground">Recent orders</div>
                <div className="space-y-2 text-xs">
                  {[
                    { id: "ORD-2841", city: "Tashkent", s: "In transit", t: "success" },
                    { id: "ORD-2840", city: "Samarkand", s: "Delayed", t: "warning" },
                    { id: "ORD-2839", city: "Bukhara", s: "Delivered", t: "success" },
                    { id: "ORD-2838", city: "Namangan", s: "Assigned", t: "muted" },
                  ].map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-md bg-surface/60 px-2.5 py-1.5">
                      <div>
                        <div className="font-medium text-foreground">{o.id}</div>
                        <div className="text-[10px] text-muted-foreground">{o.city}</div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          o.t === "success"
                            ? "bg-success/15 text-success"
                            : o.t === "warning"
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
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
});

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
  tone?: "brand" | "success";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="mt-2 font-display text-xl font-bold text-foreground">{value}</div>
      <div className={`text-[11px] ${tone === "success" ? "text-success" : "text-brand"}`}>{delta}</div>
    </div>
  );
}
