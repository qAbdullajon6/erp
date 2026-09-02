import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading } from "./primitives";
import { Reveal } from "./motion";

const FAQS = [
  {
    q: "How long does it take to get started?",
    a: "Most teams are live within a week. Setup takes about an hour — company details, inviting your team, importing customers, vehicles and drivers. After that you can take your first order.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. FlowERP runs in any modern browser. Drivers use the mobile-optimised web app on their phones — no app store downloads required.",
  },
  {
    q: "Does it work without GPS devices?",
    a: "Yes. GPS tracking is optional. You can run the full order, dispatch and finance workflow without any hardware. If you later add GPS devices, the tracking layer turns on automatically.",
  },
  {
    q: "Can I import my existing customer and vehicle data?",
    a: "Yes. FlowERP accepts standard CSV and Excel files. The import tool guides you through mapping your columns to our fields, and you can review and correct records before they go live.",
  },
  {
    q: "How does billing work?",
    a: "You choose a plan when you set up your account. Pricing is per company per month — not per seat — so you can add as many users as your plan allows without extra charges.",
  },
  {
    q: "Is my data secure?",
    a: "All data is encrypted in transit and at rest. We use industry-standard security practices and host on infrastructure that is compliant with international data protection standards.",
  },
  {
    q: "What languages does FlowERP support?",
    a: "The platform interface is in English. The AI assistant understands queries in Uzbek, Russian and English and responds in the same language you write in.",
  },
  {
    q: "Can I try it before paying?",
    a: "Yes — every plan includes a 14-day free trial. No credit card is required to start. If you need more time to evaluate, contact us.",
  },
] as const;

export function FAQ() {
  const sectionRef = useSectionVisibility("faq");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number, q: string) => {
    const next = openIndex === i ? null : i;
    setOpenIndex(next);
    if (next !== null) {
      analytics.track({ name: "faq_question_click", params: { question: q } });
    }
  };

  return (
    <Section id="faq" sectionRef={sectionRef} className="scroll-mt-16">
      <SectionHeading
        eyebrow="FAQ"
        title="Common questions"
        lead="Everything you need to know about getting started with FlowERP."
      />

      <div className="mx-auto mt-12 max-w-3xl divide-y divide-border">
        {FAQS.map((item, i) => (
          <Reveal key={item.q} delay={i * 30}>
            <div>
              <button
                className="flex w-full items-start justify-between gap-4 py-5 text-left text-sm font-semibold text-foreground transition-colors hover:text-brand"
                onClick={() => toggle(i, item.q)}
                aria-expanded={openIndex === i}
              >
                <span>{item.q}</span>
                <span className="mt-0.5 shrink-0 text-brand">
                  {openIndex === i ? (
                    <Minus className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </span>
              </button>
              {openIndex === i && (
                <div className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
