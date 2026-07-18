import {
  Package,
  Route,
  Truck,
  Wallet,
  Users,
  Sparkles,
  ArrowRight,
  Zap,
  Shield,
  Globe,
} from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { analytics } from "@/lib/analytics";
import { openDemoModal } from "@/components/site/DemoModal";
import { Button } from "@/components/ui/button";

/**
 * Platform V2 - Retool/Notion style
 *
 * Pattern: Show platform capabilities as an interconnected system, not separate features
 * Visual emphasis on how modules work together
 * Plus: Why FlowERP section (differentiators)
 */
export function PlatformV2() {
  const sectionRef = useSectionVisibility("platform");

  const modules = [
    {
      icon: Package,
      name: "Orders",
      desc: "Capture, route, and track every shipment from a unified queue",
    },
    {
      icon: Route,
      name: "Dispatch",
      desc: "AI-optimized route assignment across your active fleet",
    },
    {
      icon: Truck,
      name: "Fleet",
      desc: "Vehicles, drivers, maintenance, and utilization in real-time",
    },
    {
      icon: Wallet,
      name: "Finance",
      desc: "Invoices and receivables synced automatically to operations",
    },
    {
      icon: Users,
      name: "Customers",
      desc: "CRM with delivery history and communication tracking",
    },
    {
      icon: Sparkles,
      name: "AI Assistant",
      desc: "Natural language interface to your entire operation",
    },
  ];

  const differentiators = [
    {
      icon: Zap,
      title: "Built for speed",
      desc: "AI answers operational questions in under 2 seconds. Not minutes. Seconds.",
    },
    {
      icon: Shield,
      title: "Your data, your control",
      desc: "Multi-tenant architecture. Role-based access. SOC 2 Type II compliant.",
    },
    {
      icon: Globe,
      title: "Works everywhere",
      desc: "Mobile apps for drivers. Web portal for customers. API for integrations.",
    },
  ];

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        {/* Platform modules */}
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            One platform.
            <br />
            <span className="text-brand">Your entire operation.</span>
          </h2>
          <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
            Six modules that work as one unified system. Data flows automatically—no spreadsheets,
            no manual syncing, no chaos.
          </p>
        </div>

        {/* Module grid */}
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <div
                key={module.name}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface/40 p-8 transition-all hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand/10 text-brand transition-transform group-hover:scale-110">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-foreground">{module.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{module.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Interconnection visual hint */}
        <div className="mt-12 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/5 px-6 py-3 text-sm font-semibold text-brand">
            <Sparkles className="h-4 w-4" />
            All modules share the same live data—nothing ever goes out of sync
          </p>
        </div>

        {/* Divider */}
        <div className="my-24 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

        {/* Why FlowERP section */}
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Why FlowERP?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built specifically for logistics operators who need power and simplicity
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {differentiators.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 text-brand">
                  <Icon className="h-8 w-8" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-foreground">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <Button
            onClick={() => {
              analytics.track({ name: "book_demo_click", params: { source: "platform_section" } });
              openDemoModal();
            }}
            size="lg"
            className="h-12 bg-brand px-8 text-base font-semibold text-brand-foreground hover:bg-brand/90"
          >
            See the platform in action
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
