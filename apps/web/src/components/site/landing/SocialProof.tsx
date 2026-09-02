import { Quote } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading, Card } from "./primitives";
import { Reveal } from "./motion";

const TESTIMONIALS = [
  {
    body: "Before FlowERP we were tracking deliveries on spreadsheets and WhatsApp threads. Now dispatch, drivers and finance all work from the same screen. The transition took one week.",
    author: "Operations Manager",
    company: "Regional freight carrier, Tashkent",
  },
  {
    body: "The dispatch board alone saved us hours every morning. We can see every vehicle, every order, and every conflict before the day starts — not after something has already gone wrong.",
    author: "Fleet Supervisor",
    company: "Last-mile delivery company, Almaty",
  },
  {
    body: "Invoicing used to be a separate process we did at the end of the month. Now it comes directly from completed deliveries, and we get paid faster because nothing slips through.",
    author: "Finance Lead",
    company: "Logistics operator, Bishkek",
  },
];

const STATS = [
  { value: "1 week", label: "Average time to go live" },
  { value: "All-in-one", label: "Orders, fleet, finance in one place" },
  { value: "Live GPS", label: "Real-time vehicle tracking" },
  { value: "AI-powered", label: "Answers from your own data" },
];

export function SocialProof() {
  const sectionRef = useSectionVisibility("social_proof");

  return (
    <Section id="social-proof" sectionRef={sectionRef} backdrop="wash" className="scroll-mt-16">
      <SectionHeading
        eyebrow="What operators say"
        title="Built for teams who move things"
        lead="FlowERP is used by logistics teams across Central Asia to run their daily operations."
      />

      {/* Stats row */}
      <Reveal delay={120}>
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-surface/60 px-5 py-5 text-center"
            >
              <div className="font-display text-2xl font-bold text-foreground">{s.value}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Testimonials */}
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <Reveal key={t.company} delay={i * 70}>
            <Card className="flex h-full flex-col gap-5 p-6">
              <Quote className="h-5 w-5 shrink-0 text-brand/50" />
              <p className="flex-1 text-sm leading-relaxed text-foreground/80">"{t.body}"</p>
              <div className="border-t border-border/60 pt-4">
                <div className="text-sm font-medium text-foreground">{t.author}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.company}</div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
