import { ArrowRight, Phone, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Container } from "./primitives";
import { Reveal } from "./motion";
import { siteConfig } from "@/lib/site-config";

const { contact } = siteConfig;

export function Closing() {
  const sectionRef = useSectionVisibility("final_cta");

  const handleGetStarted = () => {
    analytics.track({ name: "book_demo_click", params: { source: "final_cta" } });
    openDemoModal("final_cta");
  };

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="relative isolate overflow-hidden border-t border-border/60 py-24 sm:py-32"
    >
      {/* Dark gradient bg for this CTA section */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.62 0.22 45 / 0.07), transparent 70%)",
        }}
      />

      <Container>
        <div
          className="relative isolate overflow-hidden rounded-3xl border px-6 py-16 text-center sm:px-16 sm:py-20"
          style={{
            borderColor: "oklch(0.62 0.22 45 / 0.20)",
            background:
              "linear-gradient(135deg, oklch(0.62 0.22 45 / 0.06), oklch(0.62 0.22 45 / 0.02))",
          }}
        >
          {/* Grid bg inside card */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(to right, oklch(0 0 0 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, oklch(0 0 0 / 0.04) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "oklch(0.62 0.22 45 / 0.30)",
                background: "oklch(0.62 0.22 45 / 0.10)",
                color: "oklch(0.62 0.22 45)",
              }}
            >
              Get started
            </span>
          </Reveal>

          <Reveal delay={60}>
            <h2 className="mx-auto mt-5 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-[2.75rem] sm:leading-[1.1]">
              Ready to move your operation forward?
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Tell us about your fleet and your routes. We'll show you exactly what your team's
              workspace would look like.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                onClick={handleGetStarted}
                size="lg"
                className="h-12 w-full px-9 text-base font-bold sm:w-auto"
                style={{ background: "oklch(0.62 0.22 45)", color: "white" }}
              >
                Start free trial
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-4 text-sm text-muted-foreground">
              14-day free trial · No credit card required · We reply within one business day
            </p>
          </Reveal>

          {/* Contact channels */}
          <Reveal delay={270}>
            <div className="mx-auto mt-12 grid max-w-2xl gap-3 border-t border-border/50 pt-10 sm:grid-cols-3">
              <a
                href={contact.phoneHref}
                className="group flex items-center justify-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-3.5 transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <Phone className="h-4 w-4 shrink-0 text-brand" />
                <div className="text-left">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Call
                  </div>
                  <div className="text-sm font-medium text-foreground group-hover:text-brand">
                    {contact.phoneDisplay}
                  </div>
                </div>
              </a>

              {contact.whatsappHref && (
                <a
                  href={contact.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-3.5 transition-colors hover:border-brand/40 hover:bg-brand/5"
                >
                  <MessageCircle className="h-4 w-4 shrink-0 text-brand" />
                  <div className="text-left">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      WhatsApp
                    </div>
                    <div className="text-sm font-medium text-foreground group-hover:text-brand">
                      {contact.whatsappDisplay}
                    </div>
                  </div>
                </a>
              )}

              <a
                href={contact.emailHref}
                className="group flex items-center justify-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-3.5 transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <Mail className="h-4 w-4 shrink-0 text-brand" />
                <div className="text-left">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Email
                  </div>
                  <div className="text-sm font-medium text-foreground group-hover:text-brand">
                    {contact.email}
                  </div>
                </div>
              </a>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
