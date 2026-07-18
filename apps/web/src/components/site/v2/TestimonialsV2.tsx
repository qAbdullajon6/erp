import { Star, Quote } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";

/**
 * Testimonials V2 - Stripe/Notion style
 *
 * Pattern: Large, prominent testimonials with real details
 * Focus on emotional and business outcomes, not just features
 */
export function TestimonialsV2() {
  const sectionRef = useSectionVisibility("testimonials");

  const testimonials = [
    {
      quote:
        "Before FlowERP, I was answering driver calls until midnight. Now the AI handles 80% of operational questions automatically. I actually go home for dinner now.",
      author: "Sardor Malikov",
      role: "Operations Manager",
      company: "Express Logistics",
      location: "Tashkent",
      stats: "42 vehicles · 800 daily deliveries",
      avatar: "SM",
    },
    {
      quote:
        "We recovered $84,000 in late fees in the first quarter just from better route optimization. The AI dispatch paid for itself in 3 weeks.",
      author: "Aziza Karimova",
      role: "CEO",
      company: "Silk Route Logistics",
      location: "Samarkand",
      stats: "28 vehicles · 500 daily deliveries",
      avatar: "AK",
    },
    {
      quote:
        "Our on-time rate went from 82% to 97.4% in two months. Customers stopped complaining. Drivers love the mobile app. This is the first software that actually works.",
      author: "Bekzod Rashidov",
      role: "Operations Director",
      company: "Central Express",
      location: "Bukhara",
      stats: "56 vehicles · 1,200 daily deliveries",
      avatar: "BR",
    },
  ];

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-surface/30 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Loved by operations teams
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Real logistics operators. Real results. Real testimonials.
          </p>
        </div>

        {/* Testimonial grid */}
        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, idx) => (
            <div
              key={idx}
              className="flex flex-col rounded-2xl border border-border/60 bg-background p-8 shadow-lg"
            >
              {/* Stars */}
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-brand text-brand" />
                ))}
              </div>

              {/* Quote */}
              <div className="relative mt-6 flex-1">
                <Quote className="absolute -left-2 -top-2 h-8 w-8 text-brand/20" />
                <p className="relative text-base leading-relaxed text-foreground">
                  "{testimonial.quote}"
                </p>
              </div>

              {/* Author */}
              <div className="mt-8 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand">
                  {testimonial.avatar}
                </div>
                <div>
                  <div className="font-semibold text-foreground">{testimonial.author}</div>
                  <div className="text-sm text-muted-foreground">
                    {testimonial.role}, {testimonial.company}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground/70">
                    {testimonial.location} · {testimonial.stats}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Case study CTA */}
        <div className="mt-16 rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/5 via-transparent to-transparent p-12 text-center shadow-xl">
          <h3 className="font-display text-3xl font-bold text-foreground">
            How Silk Route Logistics recovered $84K in 90 days
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Read the full case study on how AI dispatch optimization eliminated late fees and
            improved customer satisfaction.
          </p>
          <button className="mt-8 inline-flex items-center gap-2 font-semibold text-brand hover:underline">
            Read case study
            <span className="text-xl">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
