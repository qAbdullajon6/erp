import { Building2, Database, Truck, Receipt } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading } from "./primitives";
import { Reveal } from "./motion";

const STEPS = [
  {
    icon: Building2,
    number: "01",
    title: "Set up your company",
    body: "Add your company details, invite your team, and assign roles. The setup wizard takes under 10 minutes.",
    time: "~10 min",
  },
  {
    icon: Database,
    number: "02",
    title: "Import your data",
    body: "Bring in customers, vehicles and drivers by hand or from a spreadsheet. No technical help needed.",
    time: "~30 min",
  },
  {
    icon: Truck,
    number: "03",
    title: "Run the day",
    body: "Create orders, assign them to drivers and vehicles on the dispatch board, and track deliveries live.",
    time: "Day 1",
  },
  {
    icon: Receipt,
    number: "04",
    title: "Invoice and review",
    body: "Raise invoices directly from delivered orders, record payments, and see how your operation performed.",
    time: "End of day",
  },
];

export function HowItWorks() {
  const sectionRef = useSectionVisibility("how-it-works");

  return (
    <Section id="how-it-works" sectionRef={sectionRef} className="scroll-mt-16" backdrop="wash">
      <SectionHeading
        eyebrow="How it works"
        title="Live in four steps"
        lead="No long implementation project. No consultants. Set the company up, bring your data in, and start running deliveries — usually within a week."
      />

      <div className="relative mt-16">
        {/* Connecting line — desktop only */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-10 hidden h-px lg:block"
          style={{
            background:
              "linear-gradient(to right, transparent, oklch(0.62 0.22 45 / 0.3) 10%, oklch(0.62 0.22 45 / 0.3) 90%, transparent)",
          }}
        />

        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 80} as="li" className="relative">
              {/* Step number circle */}
              <div className="relative z-10 mb-5 flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-display text-sm font-bold"
                  style={{
                    borderColor: "oklch(0.62 0.22 45 / 0.40)",
                    background: "oklch(0.62 0.22 45 / 0.12)",
                    color: "oklch(0.62 0.22 45)",
                  }}
                >
                  {step.number}
                </div>
              </div>

              {/* Icon */}
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
                <step.icon className="h-5 w-5" />
              </div>

              <h3 className="text-base font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

              {/* Time badge */}
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "oklch(0.62 0.22 45)" }}
                />
                {step.time}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
