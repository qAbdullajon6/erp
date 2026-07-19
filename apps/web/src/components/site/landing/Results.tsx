import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading, Card, FadeDivider } from "./primitives";
import { CountUp, Reveal } from "./motion";

const METRICS = [
  { value: 97.4, decimals: 1, suffix: "%", label: "Average on-time rate", sub: "up from 82% at rollout" },
  { value: 42, suffix: " hrs", label: "Saved every week", sub: "less manual coordination" },
  { value: 84, prefix: "$", suffix: "K", label: "Recovered in 90 days", sub: "fewer delivery penalties" },
  { value: 18, suffix: " days", label: "To full go-live", sub: "data import included" },
];

const TESTIMONIALS = [
  {
    quote:
      "Before FlowERP I was fielding driver calls until midnight. Now the copilot handles most operational questions on its own. I actually make it home for dinner.",
    author: "Sardor Malikov",
    role: "Operations Manager",
    company: "Express Logistics",
    meta: "Tashkent · 42 vehicles",
    avatar: "SM",
  },
  {
    quote:
      "We recovered $84,000 in penalties in a single quarter from smarter routing alone. The AI dispatch paid for itself in three weeks.",
    author: "Aziza Karimova",
    role: "Chief Executive",
    company: "Silk Route Logistics",
    meta: "Samarkand · 28 vehicles",
    avatar: "AK",
  },
  {
    quote:
      "On-time delivery went from 82% to 97% in two months. Customers stopped calling to complain, and drivers actually like the app.",
    author: "Bekzod Rashidov",
    role: "Operations Director",
    company: "Central Express",
    meta: "Bukhara · 56 vehicles",
    avatar: "BR",
  },
];

export function Results() {
  const sectionRef = useSectionVisibility("results");

  return (
    <Section id="customers" sectionRef={sectionRef} width="wide" backdrop="wash">
      <SectionHeading
        eyebrow="Results"
        title="Outcomes teams can measure"
        lead="Operators don't switch platforms for features. They switch for hours reclaimed, penalties avoided, and customers who stop calling."
      />

      <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <Reveal key={m.label} delay={i * 70} className="text-center lg:text-left">
            <div className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              <CountUp value={m.value} decimals={m.decimals} prefix={m.prefix} suffix={m.suffix} />
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">{m.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{m.sub}</div>
          </Reveal>
        ))}
      </div>

      <FadeDivider className="my-16" />

      <div className="grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <Reveal key={t.author} delay={i * 80} className="h-full">
            <Card className="flex h-full flex-col p-7">
              <div aria-hidden className="font-display text-4xl leading-none text-brand/40">
                &ldquo;
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-foreground/90">{t.quote}</p>
              <div className="mt-6 flex items-center gap-3 border-t border-border/60 pt-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand ring-1 ring-inset ring-brand/15">
                  {t.avatar}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{t.author}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.role}, {t.company}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground/70">{t.meta}</div>
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
