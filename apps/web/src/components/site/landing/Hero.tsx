import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { FleetTrackingAnimation } from "./FleetTrackingAnimation";
import { Reveal } from "./motion";

export function Hero() {
  const handleGetStarted = () => {
    analytics.track({ name: "hero_cta_click", params: { cta_text: "Get started free" } });
    analytics.track({ name: "book_demo_click", params: { source: "hero" } });
    openDemoModal("hero");
  };

  const handleWatchDemo = () => {
    analytics.track({ name: "book_demo_click", params: { source: "hero_demo" } });
    const el = document.getElementById("demo");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative isolate min-h-[92vh] overflow-hidden bg-white dark:bg-[oklch(0.09_0.008_260)] pt-16">
      {/* Background grid – light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0 0 0 / 0.035) 1px, transparent 1px), linear-gradient(to bottom, oklch(0 0 0 / 0.035) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Background grid – dark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(1 0 0 / 0.03) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Orange glow at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% -5%, oklch(0.72 0.20 48 / 0.18), transparent 70%)",
        }}
      />
      {/* Subtle side glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 -z-10 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, oklch(0.72 0.20 48 / 0.06), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-60 -z-10 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, oklch(0.72 0.20 48 / 0.05), transparent 70%)" }}
      />

      <div className="mx-auto max-w-7xl px-6">
        {/* Top label */}
        <div className="flex justify-center pt-14 sm:pt-20">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[oklch(0.72_0.20_48/0.30)] bg-[oklch(0.72_0.20_48/0.10)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[oklch(0.52_0.18_45)] dark:text-[oklch(0.85_0.15_50)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.74_0.20_48)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[oklch(0.74_0.20_48)]" />
              </span>
              Logistics Operations Platform
            </div>
          </Reveal>
        </div>

        {/* Headline */}
        <div className="mx-auto mt-8 max-w-4xl text-center">
          <Reveal delay={60}>
            <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight text-foreground sm:text-[3.75rem] lg:text-[4.5rem]">
              Run your fleet.{" "}
              <span
                className="font-bold"
                style={{
                  background: "linear-gradient(135deg, oklch(0.85 0.18 55), oklch(0.72 0.22 45))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Track every move.
              </span>{" "}
              Invoice faster.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Orders, dispatch, fleet tracking and finance in one platform — built for logistics
              companies that need real-time visibility over every delivery.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                onClick={handleGetStarted}
                size="lg"
                className="h-12 w-full px-8 text-base font-bold sm:w-auto"
                style={{ background: "oklch(0.62 0.22 45)", color: "white" }}
              >
                Get started free
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button
                onClick={handleWatchDemo}
                size="lg"
                variant="outline"
                className="h-12 w-full px-8 text-base font-semibold sm:w-auto
                  border-border text-foreground hover:bg-[oklch(0.62_0.22_45/0.07)] hover:text-foreground
                  dark:border-[oklch(1_0_0/0.15)] dark:bg-[oklch(1_0_0/0.05)] dark:text-white dark:hover:border-[oklch(0.72_0.20_48/0.50)] dark:hover:bg-[oklch(0.72_0.20_48/0.08)] dark:hover:text-white"
              >
                <Play className="h-4 w-4 fill-current" />
                Watch demo
              </Button>
            </div>
          </Reveal>

          <Reveal delay={230}>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[oklch(0.66_0.18_145)]" />
                14-day free trial
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[oklch(0.66_0.18_145)]" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[oklch(0.66_0.18_145)]" />
                Live in under a week
              </span>
            </div>
          </Reveal>
        </div>

        {/* Product preview — FleetTrackingAnimation already renders its own chrome */}
        <div className="mt-16 pb-16 lg:mt-20">
          <Reveal delay={280}>
            <FleetTrackingAnimation />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
