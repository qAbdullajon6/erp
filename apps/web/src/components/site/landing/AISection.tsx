import { useEffect, useState } from "react";
import {
  Sparkles,
  Database,
  Workflow,
  ShieldCheck,
  Zap,
  Check,
  Loader2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, Eyebrow, Card, IconTile, LiveDot } from "./primitives";
import { Reveal, useInView, usePrefersReducedMotion } from "./motion";
import { cn } from "@/lib/utils";

const CAPABILITIES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Database,
    title: "Grounded in your live data",
    desc: "Every answer is drawn from your real orders, fleet, and finances — never a generic guess.",
  },
  {
    icon: Workflow,
    title: "Reasons step by step",
    desc: "It plans across constraints — capacity, distance, SLAs — instead of returning a canned reply.",
  },
  {
    icon: ShieldCheck,
    title: "Takes action, with approval",
    desc: "Reassign routes, draft invoices, or notify customers — you stay in control of every change.",
  },
  {
    icon: Zap,
    title: "Answers in under two seconds",
    desc: "Ask in plain language and get a decision-ready response before your coffee cools.",
  },
];

export function AISection() {
  const sectionRef = useSectionVisibility("ai");

  return (
    <Section id="ai" sectionRef={sectionRef} width="wide" backdrop="wash">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal>
            <Eyebrow>AI copilot</Eyebrow>
          </Reveal>
          <Reveal delay={60} as="h2" className="mt-4 text-balance font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            An operating system that thinks
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Most software waits for you to find the problem. FlowERP's copilot reads the whole
              operation, reasons through the options, and hands you the fix — ready to apply.
            </p>
          </Reveal>

          <div className="mt-10 space-y-6">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={160 + i * 70}>
                <div className="flex gap-4">
                  <IconTile>
                    <c.icon className="h-5 w-5" />
                  </IconTile>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={120}>
          <ThinkingPanel />
        </Reveal>
      </div>
    </Section>
  );
}

const STEPS = [
  "Scanning 42 active routes for risk",
  "5 shipments on Route 14 flagged — congestion + tight windows",
  "Checking nearby drivers with available capacity",
  "3 drivers within 8 minutes have slack today",
];

function ThinkingPanel() {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ once: true });
  const [step, setStep] = useState(reduced ? STEPS.length : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStep(STEPS.length);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = (s: number) => {
      if (!alive) return;
      setStep(s);
      timer = setTimeout(() => run(s < STEPS.length ? s + 1 : 0), s < STEPS.length ? 950 : 4600);
    };
    run(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [inView, reduced]);

  const finished = step >= STEPS.length;

  return (
    <Card ref={ref} className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
        <IconTile size="sm">
          <Sparkles className="h-4 w-4" />
        </IconTile>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Operations Copilot</div>
          <div className="text-xs text-muted-foreground">Reasoning over live data</div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand">
          <LiveDot tone="brand" />
          {finished ? "Done" : "Thinking"}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-muted/60 px-4 py-2.5 text-sm font-medium text-foreground">
          Route 14 looks backed up — what should we do?
        </div>

        <div className="mt-5 space-y-2.5">
          {STEPS.map((text, i) => {
            const state = i < step ? "done" : i === step && !finished ? "active" : finished ? "done" : "pending";
            const visible = i <= step || finished;
            return (
              <div
                key={text}
                className="flex items-start gap-2.5"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(6px)",
                  transition: "opacity 0.4s ease, transform 0.4s ease",
                }}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {state === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  ) : (
                    <Check className="h-4 w-4 text-success" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm leading-snug",
                    state === "active" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {text}
                </span>
              </div>
            );
          })}
        </div>

        {/* result */}
        <div
          className="mt-5 overflow-hidden"
          style={{
            maxHeight: finished ? 200 : 0,
            opacity: finished ? 1 : 0,
            transition: "max-height 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease",
          }}
        >
          <div className="rounded-xl border border-brand/25 bg-brand/[0.07] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand">
              Recommended action
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Reassign 3 stops to Dilshod, Aziz, and Umid — recovers{" "}
              <span className="font-semibold">~22 min</span> per delivery and keeps every SLA green.
            </p>
            <div className="mt-3 flex items-center gap-2" aria-hidden>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-brand-foreground">
                Apply changes
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground">
                Review
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
