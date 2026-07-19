import { useEffect, useState } from "react";
import { ArrowRight, ArrowUp, Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { cn } from "@/lib/utils";
import { Container, BrowserFrame, IconTile, LiveDot } from "./primitives";
import { CountUp, Reveal, useTypewriter, usePointerParallax, usePrefersReducedMotion } from "./motion";

const CONVERSATION = [
  {
    q: "Which deliveries are running late today?",
    a: "7 shipments are delayed — 5 on Route 14 from congestion. Reassigning 3 to nearby drivers recovers ~22 min each. Want me to apply it?",
  },
  {
    q: "Show unpaid invoices over 30 days.",
    a: "4 accounts, $22,670 outstanding. Alfa Trade is the largest at $8,420. I can draft reminders for all four right now.",
  },
  {
    q: "Is any driver overloaded this week?",
    a: "Aziz K. and Bekzod A. are past 55 hours. Moving 6 stops to Route 07 rebalances the week and keeps every SLA green.",
  },
];

export function Hero() {
  const sectionRef = useSectionVisibility("hero");

  const handleDemo = () => {
    analytics.track({ name: "hero_cta_click", params: { cta_text: "Request a personalized demo" } });
    analytics.track({ name: "book_demo_click", params: { source: "hero" } });
    openDemoModal("hero");
  };

  const handleWatch = () => {
    analytics.track({ name: "hero_cta_click", params: { cta_text: "See how it works" } });
    document.getElementById("ai")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden">
      {/* ambient: one soft brand wash + a barely-there grid, both masked */}
      <div aria-hidden className="lv2-wash pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px]" />
      <div
        aria-hidden
        className="lv2-grid lv2-mask-b pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] opacity-60"
      />

      <Container width="wide" className="pb-20 pt-32 sm:pb-28 sm:pt-40">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <a
              href="#ai"
              className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pl-1.5 pr-3 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-brand/40 hover:text-foreground"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                <Sparkles className="h-3.5 w-3.5" />
                New
              </span>
              <span className="hidden sm:inline">Real-time AI dispatch that reasons like your best planner</span>
              <span className="sm:hidden">Real-time AI dispatch</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </a>
          </Reveal>

          <Reveal delay={70} as="h1" className="mt-7 text-balance font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            The operating system for
            <br className="hidden sm:block" /> <span className="text-brand">modern logistics</span>
          </Reveal>

          <Reveal delay={140}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              FlowERP unifies orders, dispatch, fleet, and finance into one live command center — with
              an AI copilot that answers questions, catches problems, and takes action in seconds.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                onClick={handleDemo}
                size="lg"
                className="h-12 w-full bg-brand px-7 text-base font-semibold text-brand-foreground hover:bg-brand/90 sm:w-auto"
              >
                Request a personalized demo
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button
                onClick={handleWatch}
                variant="outline"
                size="lg"
                className="h-12 w-full border-border bg-surface/60 px-6 text-base font-semibold text-foreground hover:bg-surface hover:text-foreground sm:w-auto"
              >
                <Play className="h-4 w-4" />
                See how it works
              </Button>
            </div>
          </Reveal>

          <Reveal delay={280}>
            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required · 14-day trial · Live in under 20 minutes
            </p>
          </Reveal>
        </div>

        <CommandCenter />
      </Container>
    </section>
  );
}

function CommandCenter() {
  const { containerRef, style: parallax } = usePointerParallax(10);

  return (
    <Reveal delay={340} className="relative mx-auto mt-16 max-w-5xl sm:mt-20">
      <div ref={containerRef} className="relative">
        {/* soft grounding wash (no blur orb) */}
        <div aria-hidden className="lv2-wash-soft pointer-events-none absolute -inset-x-8 -top-6 -z-10 h-64" />

        <div style={parallax}>
          <BrowserFrame url="app.flowerp.ai · Operations Copilot">
            <AiConsole />
          </BrowserFrame>
        </div>

        {/* floating status chips — hug the frame edges so they never cover content */}
        <div
          style={parallax}
          className="lv2-float pointer-events-none absolute -bottom-4 left-6 hidden rounded-xl border border-success/30 bg-background/90 px-3.5 py-2.5 shadow-xl backdrop-blur md:block lg:-left-4 lg:bottom-10"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-success">
            <LiveDot />
            3 routes optimized
          </div>
        </div>
        <div
          style={parallax}
          className="lv2-float-slow pointer-events-none absolute -top-4 right-6 hidden rounded-xl border border-brand/30 bg-background/90 px-3.5 py-2.5 shadow-xl backdrop-blur md:block lg:-right-4 lg:top-10"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            2 delays predicted
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function AiConsole() {
  const [index, setIndex] = useState(0);
  const reduced = usePrefersReducedMotion();
  const current = CONVERSATION[index];
  const { text: typed, done } = useTypewriter(current.a, { speed: 22, startDelay: 450 });

  useEffect(() => {
    if (!done || reduced) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % CONVERSATION.length), 2600);
    return () => clearTimeout(t);
  }, [done, reduced]);

  return (
    <div className="grid gap-0 sm:grid-cols-[1fr_240px]">
      {/* conversation */}
      <div className="p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <IconTile>
            <Sparkles className="h-5 w-5" />
          </IconTile>
          <div>
            <div className="text-sm font-semibold text-foreground">Operations Copilot</div>
            <div className="text-xs text-muted-foreground">Connected to your live operation</div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div
            key={`q-${index}`}
            className="ml-auto max-w-md rounded-2xl rounded-tr-sm bg-muted/60 px-4 py-2.5 text-sm font-medium text-foreground"
            style={{ animation: reduced ? undefined : "lv2-rise 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
          >
            {current.q}
          </div>
          <div className="max-w-lg rounded-2xl rounded-tl-sm border border-brand/25 bg-brand/[0.07] px-4 py-3 text-sm leading-relaxed text-foreground/95">
            {typed}
            {!done && <span className="lv2-caret ml-0.5 inline-block h-4 w-0.5 -translate-y-0.5 bg-brand align-middle" />}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
          <input
            disabled
            aria-hidden
            tabIndex={-1}
            placeholder="Ask about deliveries, invoices, fleet…"
            className="flex-1 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ⌘K
          </kbd>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <ArrowUp className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* live ops rail */}
      <div className="grid grid-cols-3 gap-px border-t border-border bg-border/60 sm:grid-cols-1 sm:border-l sm:border-t-0">
        <LiveStat label="Orders today" value={<CountUp value={1284} />} />
        <LiveStat label="Fleet active" value={<CountUp value={86} suffix="/92" />} />
        <LiveStat label="On-time rate" value={<CountUp value={97.4} decimals={1} suffix="%" />} tone="success" />
      </div>
    </div>
  );
}

function LiveStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success";
}) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5 sm:py-6">
      <div
        className={cn(
          "font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
