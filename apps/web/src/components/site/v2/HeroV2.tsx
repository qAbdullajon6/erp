import { memo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";

/**
 * Hero V2 - Complete redesign inspired by Linear, Stripe, Vercel
 *
 * Pattern: Large impactful headline + minimal subtext + immediate product visual
 * No fluff, no marketing speak - direct value proposition
 */
export function HeroV2() {
  const sectionRef = useSectionVisibility("hero");

  const handleDemoClick = () => {
    analytics.track({ name: "hero_cta_click", params: { cta_text: "Request demo" } });
    analytics.track({ name: "book_demo_click", params: { source: "hero" } });
    openDemoModal();
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden border-b border-border/40">
      {/* Subtle gradient - Vercel style */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_0%,oklch(0.68_0.17_250/0.08),transparent_50%)]"
      />

      <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-32 sm:pb-24 sm:pt-40">
        {/* Headline system - massive, confident, clear */}
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="font-display text-6xl font-bold leading-[1.08] tracking-tighter text-foreground sm:text-7xl lg:text-8xl">
            Your logistics
            <br />
            operation,{" "}
            <span className="bg-gradient-to-br from-brand via-brand to-brand/70 bg-clip-text text-transparent">
              orchestrated
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-muted-foreground sm:text-2xl">
            FlowERP unifies orders, dispatch, fleet, and finance into one AI-powered command center.
            Ask questions, get answers, take action—instantly.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              onClick={handleDemoClick}
              size="lg"
              className="h-12 bg-brand px-8 text-base font-semibold text-brand-foreground hover:bg-brand/90"
            >
              Request demo
              <ArrowRight className="h-5 w-5" />
            </Button>
            <button
              onClick={() => {
                analytics.track({ name: "hero_cta_click", params: { cta_text: "Watch video" } });
                document.getElementById("product-demo")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex h-12 items-center gap-2 rounded-lg px-6 text-base font-semibold text-foreground transition-colors hover:text-brand"
            >
              <Play className="h-5 w-5" />
              Watch video
            </button>
          </div>
        </div>

        {/* Product hero - Linear/Stripe style: show the actual product, not an illustration */}
        <ProductHero />
      </div>
    </section>
  );
}

/**
 * Product visual - the real interface, not marketing fluff
 * Shows the AI command bar in action - the hero feature
 */
const ProductHero = memo(function ProductHero() {
  const [messageIndex, setMessageIndex] = useState(0);

  const conversations = [
    {
      q: "Which deliveries are running late today?",
      a: "7 shipments delayed—5 on Route 14 from traffic. Reassigning 3 to available drivers recovers 22 min average. Apply changes?",
    },
    {
      q: "Show me unpaid invoices over 30 days",
      a: "4 customers: Alfa Trade ($8,420), Nexo Retail ($6,150), Silk Freight ($4,900), BM Wholesale ($3,200). Draft reminders?",
    },
    {
      q: "Are any drivers overloaded this week?",
      a: "Aziz K. and Bekzod A. exceeded 55 hours. Recommend redistributing 6 stops to underused drivers on Route 07.",
    },
  ];

  const current = conversations[messageIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % conversations.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative mx-auto mt-20 max-w-6xl" aria-hidden="true">
      {/* Depth shadow - Stripe pattern */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-brand/10 to-transparent opacity-60 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-2xl">
        {/* Chrome */}
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-white/10" />
            <span className="h-3 w-3 rounded-full bg-white/10" />
            <span className="h-3 w-3 rounded-full bg-white/10" />
          </div>
          <span className="text-sm text-muted-foreground">app.flowerp.uz</span>
          <span className="ml-auto flex items-center gap-2 text-xs font-medium text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            Live
          </span>
        </div>

        {/* AI Interface - the hero */}
        <div className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground">Operations Assistant</div>
              <div className="text-xs text-muted-foreground">Ask anything about your operation</div>
            </div>
          </div>

          {/* Conversation */}
          <div className="space-y-4">
            <div className="ml-auto max-w-md rounded-2xl rounded-tr-sm bg-muted/50 px-5 py-3 text-sm font-medium text-foreground">
              {current.q}
            </div>
            <div className="max-w-lg rounded-2xl rounded-tl-sm border border-brand/30 bg-brand/5 px-5 py-4 text-sm leading-relaxed text-foreground/95">
              {current.a}
            </div>
          </div>

          {/* Input bar */}
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <input
              disabled
              placeholder="Ask about deliveries, invoices, fleet utilization..."
              className="flex-1 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Live stats below - compact */}
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border/40 pt-6">
            <Stat label="Orders today" value="1,284" />
            <Stat label="Fleet active" value="86/92" />
            <Stat label="On-time" value="97.4%" />
          </div>
        </div>
      </div>

      {/* Floating indicators */}
      <div className="pointer-events-none absolute -bottom-4 -left-4 rounded-xl border border-success/40 bg-background/95 px-4 py-3 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-success">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          3 routes optimized
        </div>
      </div>
      <div className="pointer-events-none absolute -right-4 -top-4 rounded-xl border border-brand/40 bg-background/95 px-4 py-3 shadow-xl backdrop-blur-sm">
        <div className="text-xs font-medium text-brand">AI analyzing</div>
      </div>
    </div>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
