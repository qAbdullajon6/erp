import { useSectionVisibility } from "@/lib/analytics/hooks";

/**
 * Trust Bar V2 - Stripe/Ramp style
 *
 * Pattern: Immediate social proof - numbers + logos
 * Positioned right after hero, before any product details
 * Builds credibility fast
 */
export function TrustBarV2() {
  const sectionRef = useSectionVisibility("trust_bar");

  return (
    <section
      ref={sectionRef}
      className="relative border-b border-border/40 bg-surface/30 py-16 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-7xl px-6">
        {/* Stats row - Ramp pattern */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <StatBlock number="10,000+" label="Deliveries per day" />
          <StatBlock number="97.4%" label="Avg on-time rate" />
          <StatBlock number="42hrs" label="Saved per week" />
          <StatBlock number="23" label="Active companies" />
        </div>

        {/* Divider */}
        <div className="my-12 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

        {/* Trusted by section */}
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Trusted by logistics teams across Central Asia
          </p>

          {/* Logo grid - would be real customer logos */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 grayscale opacity-60">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex h-12 w-32 items-center justify-center rounded-lg border border-border/40 bg-background/40 font-display text-sm font-semibold text-muted-foreground"
              >
                Company {i}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatBlock({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-4xl font-bold tracking-tight text-foreground">{number}</div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
