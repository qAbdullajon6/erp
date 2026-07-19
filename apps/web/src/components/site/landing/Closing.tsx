import { ArrowRight, Phone, MessageCircle, Mail, Globe, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./motion";
import { siteConfig } from "@/lib/site-config";

const { contact } = siteConfig;
const CHANNELS: { icon: LucideIcon; label: string; value: string; href: string }[] = [
  { icon: Phone, label: "Call", value: contact.phoneDisplay, href: contact.phoneHref },
  ...(contact.whatsappHref
    ? [{ icon: MessageCircle, label: "WhatsApp", value: contact.whatsappDisplay, href: contact.whatsappHref }]
    : []),
  { icon: Mail, label: "Email", value: contact.email, href: contact.emailHref },
  { icon: Globe, label: "Web", value: contact.websiteDisplay, href: contact.website },
];

export function Closing() {
  const sectionRef = useSectionVisibility("final_cta");

  const handleDemo = () => {
    analytics.track({ name: "book_demo_click", params: { source: "final_cta" } });
    openDemoModal("final_cta");
  };

  return (
    <section id="contact" ref={sectionRef} className="relative isolate border-t border-border/60 py-24 sm:py-32">
      <Container width="wide">
        <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface/60 px-6 py-16 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="lv2-wash-soft pointer-events-none absolute inset-0 -z-10" />
          <div aria-hidden className="lv2-grid lv2-mask-radial pointer-events-none absolute inset-0 -z-10 opacity-50" />

          <Reveal>
            <Eyebrow>Ready when you are</Eyebrow>
          </Reveal>
          <Reveal delay={60} as="h2" className="mx-auto mt-4 max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Stop firefighting. Start orchestrating.
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              See your own operation running on FlowERP in under 20 minutes. We'll tailor the demo to
              your fleet, your routes, and your workflow.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex justify-center">
              <Button
                onClick={handleDemo}
                size="lg"
                className="h-12 bg-brand px-8 text-base font-semibold text-brand-foreground hover:bg-brand/90"
              >
                Request a personalized demo
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </Reveal>
          <Reveal delay={230}>
            <p className="mt-5 text-sm text-muted-foreground">
              14-day trial · No credit card · 2-hour average response
            </p>
          </Reveal>

          <Reveal delay={280}>
            <div className="mx-auto mt-12 grid max-w-3xl gap-3 border-t border-border/60 pt-10 sm:grid-cols-2 lg:grid-cols-4">
              {CHANNELS.map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-left transition-colors hover:border-brand/40"
                >
                  <c.icon className="h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {c.label}
                    </div>
                    <div className="truncate text-sm font-medium text-foreground group-hover:text-brand">
                      {c.value}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
