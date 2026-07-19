import { useState } from "react";
import { Plus } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { analytics } from "@/lib/analytics";
import { Section, SectionHeading } from "./primitives";
import { Reveal } from "./motion";
import { cn } from "@/lib/utils";

export const FAQS = [
  {
    q: "How long does implementation take?",
    a: "Most teams are fully live in about 18 days. Week one we import your data or connect existing systems; week two you run FlowERP alongside your current process; week three you go live, and we stay close for two weeks after launch.",
  },
  {
    q: "Do I need to train my entire team?",
    a: "Rarely. Because the copilot answers in plain language, most people never touch complex screens. Operations managers and dispatchers get a 2–3 hour onboarding, and drivers need about 15 minutes with the mobile app.",
  },
  {
    q: "What if our operation is too unique for software?",
    a: "We've yet to meet one we couldn't handle. FlowERP is built for real logistics complexity — custom delivery windows, multi-stop routes, COD, proof of delivery, temperature-controlled cargo — and we'll configure or integrate for genuine edge cases.",
  },
  {
    q: "Can we try it before committing?",
    a: "Yes. Every plan includes a 14-day trial with no credit card. We'll help load sample data that mirrors your workflow, and if it isn't a fit you keep your data and can export it anytime.",
  },
  {
    q: "How does the AI actually work?",
    a: "The copilot is grounded in your live data — orders, fleet, drivers, invoices. Ask a question and it queries your real operation, reasons over the constraints, and responds with specific, actionable answers. It can also take actions like reassigning routes or drafting notifications, with your approval.",
  },
  {
    q: "What happens to our data if we cancel?",
    a: "You own your data, always. Export everything in CSV or JSON on your way out. We retain it for 30 days in case you return, then permanently delete it. No lock-in and no export fees.",
  },
  {
    q: "Do you integrate with our existing tools?",
    a: "Yes — Google Maps for routing, WhatsApp and Telegram for notifications, Stripe and QuickBooks for finance, plus a REST API and webhooks for anything custom. Enterprise plans include dedicated integration support.",
  },
  {
    q: "Is this built for our region?",
    a: "FlowERP is built for logistics operators in Central Asia, with local payment methods and English, Russian, and Uzbek interfaces. That said, it works globally — customers run on it from Tashkent to Singapore.",
  },
];

export function Faq() {
  const sectionRef = useSectionVisibility("faq");
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (i: number) => {
    const next = open === i ? null : i;
    setOpen(next);
    if (next !== null) analytics.track({ name: "faq_opened", params: { question: FAQS[i].q } });
  };

  return (
    <Section id="faq" sectionRef={sectionRef} width="narrow">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />

      <div className="mx-auto mt-14 max-w-3xl divide-y divide-border/70 border-y border-border/70">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <Reveal key={item.q} delay={i * 40}>
              <div>
                <h3>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-base font-semibold text-foreground">{item.q}</span>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300",
                        isOpen && "rotate-45 border-brand/40 text-brand",
                      )}
                    >
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-panel-${i}`}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="pb-5 pr-11 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
