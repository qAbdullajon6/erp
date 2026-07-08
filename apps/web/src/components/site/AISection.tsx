import { Sparkles, User, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";

const conversation = [
  {
    q: "How many deliveries are delayed today?",
    a: "7 shipments are delayed. 5 are on Route 14 due to traffic. I can reassign 3 to available drivers with a 22-minute average time saving.",
  },
  {
    q: "Which customers have unpaid invoices over 30 days?",
    a: "4 customers: Alfa Trade ($8,420), Nexo Retail ($6,150), Silk Freight ($4,900), and BM Wholesale ($3,200). Want me to draft reminder emails?",
  },
  {
    q: "Are any drivers overloaded this week?",
    a: "Aziz K. and Bekzod A. exceeded 55 hours. I recommend redistributing 6 stops from their queues to underused drivers on Route 07.",
  },
  {
    q: "What was our revenue last week?",
    a: "$482,140 in completed deliveries — up 8.6% week over week. On-time rate held at 97.4%.",
  },
];

export function AISection() {
  return (
    <section id="ai" className="relative border-t border-border/60 py-24">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
              <Sparkles className="h-3.5 w-3.5" />
              AI Assistant
            </div>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Ask Your Operations.<br />
              <span className="text-gradient-brand">Get Answers in Seconds.</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
              FlowERP AI understands your fleet, orders, drivers, and finances. Ask plain-language questions about delays, invoices, workloads, or revenue — and act on the answer in one click.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Detects delays, bottlenecks, and payment issues automatically",
                "Suggests reassignments and route changes with impact estimates",
                "Grounded in your live operational data — never generic",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-foreground/90">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button
                onClick={openDemoModal}
                size="lg"
                className="h-12 bg-gradient-brand px-6 text-brand-foreground hover:opacity-90"
              >
                Request a Personalized Demo
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-brand/25 blur-3xl" />
            <div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-surface/80 backdrop-blur-sm shadow-elevated">
              <div className="flex items-center gap-3 border-b border-brand/20 bg-gradient-to-r from-background/60 to-background/40 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
                  <Sparkles className="h-4 w-4 text-brand-foreground" />
                </div>
                <span className="font-display text-sm font-semibold">Operations Assistant</span>
                <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-success">
                  <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              </div>
              <div className="max-h-[480px] space-y-5 overflow-y-auto px-5 py-6 scrollbar-thin scrollbar-track-surface scrollbar-thumb-brand/40 hover:scrollbar-thumb-brand/60">
                {conversation.map((m, i) => (
                  <div key={i} className="space-y-4 animate-in fade-in-50">
                    <div className="flex items-end gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/60">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="max-w-xs rounded-2xl rounded-bl-sm bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground/90 border border-muted/40">
                        {m.q}
                      </div>
                    </div>
                    <div className="flex items-end gap-3 justify-end">
                      <div className="max-w-xs rounded-2xl rounded-br-sm border border-brand/30 bg-brand/15 px-4 py-3 text-sm leading-relaxed text-foreground/95 backdrop-blur-sm">
                        {m.a}
                      </div>
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-brand shadow-sm">
                        <Sparkles className="h-4 w-4 text-brand-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-brand/20 bg-gradient-to-r from-background/60 to-background/40 p-4">
                <div className="flex items-center gap-2 rounded-xl border border-brand/25 bg-surface/80 backdrop-blur-sm px-4 py-3 shadow-sm hover:border-brand/40 transition-colors">
                  <input
                    disabled
                    placeholder="Ask about deliveries, invoices, drivers…"
                    className="flex-1 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                  <button className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand text-brand-foreground hover:shadow-sm transition-all">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
