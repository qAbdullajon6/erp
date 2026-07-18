import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";

/**
 * CTA V2 - Vercel/Linear style
 *
 * Pattern: Large, impactful final CTA with gradient background
 * Strong visual presence, clear single action
 */
export function CTAV2() {
  const sectionRef = useSectionVisibility("final_cta");

  const handleDemoClick = () => {
    analytics.track({ name: "book_demo_click", params: { source: "final_cta" } });
    openDemoModal();
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-br from-brand/10 via-brand/5 to-transparent p-16 text-center shadow-2xl">
          {/* Background decoration */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_50%,oklch(0.68_0.17_250/0.15),transparent_70%)]"
          />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand backdrop-blur-sm">
              <Sparkles className="h-4 w-4" />
              Ready to get started?
            </div>

            <h2 className="mt-6 font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Stop firefighting.
              <br />
              <span className="text-brand">Start orchestrating.</span>
            </h2>

            <p className="mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-muted-foreground">
              Join 23 logistics companies using FlowERP to orchestrate 10,000+ deliveries every day.
              See your operation running on FlowERP in under 20 minutes.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                onClick={handleDemoClick}
                size="lg"
                className="h-14 bg-brand px-10 text-lg font-semibold text-brand-foreground hover:bg-brand/90"
              >
                Request demo
                <ArrowRight className="h-6 w-6" />
              </Button>
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              14-day free trial · No credit card required · 2-hour average response time
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
