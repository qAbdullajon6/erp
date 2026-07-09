import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/// Answers are written to be true of the product as it exists today. Nothing
/// here promises an integration or certification that has not been built.
const FAQS = [
  {
    q: "How long does it take to get started?",
    a: "Onboarding walks you through your organization profile, then your first customer, driver, vehicle, and order. Most teams have a live order moving through dispatch on day one — there is no data-migration project to schedule first.",
  },
  {
    q: "Can my dispatchers, accountants, and drivers all use the same system?",
    a: "Yes, and they each see a different one. Roles are enforced on the server: a driver only ever sees their own deliveries, an accountant gets read-only operations with full finance access, and a dispatcher can assign drivers and vehicles but cannot touch invoices.",
  },
  {
    q: "What happens to an order after it is created?",
    a: "It moves forward one step at a time — draft, pending, assigned, picked up, in transit, delivered — and every transition is timestamped with who made it. A dispatch links the order to a specific driver and vehicle, and the same vehicle cannot be double-booked.",
  },
  {
    q: "Is our data separated from other companies?",
    a: "Every record belongs to exactly one organization, and that scope is applied in the API rather than in the browser. Signing in gives you a token bound to your organization and role; there is no request that can reach another tenant's rows.",
  },
  {
    q: "What does the AI assistant actually do?",
    a: "It answers questions about your live operational data — which deliveries are running late, which customers have unpaid invoices, whether a driver is overloaded — and proposes reassignments. It reads the same records your team does, so it never invents a number.",
  },
  {
    q: "How is pricing structured?",
    a: "Pricing depends on fleet size and which modules you turn on. Book a demo and we'll size it against your actual order volume rather than a generic per-seat table.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Questions logistics teams ask us
          </h2>
          <p className="mt-4 text-muted-foreground">
            Straight answers about roles, data, and what happens after you sign up.
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-12">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.q} value={faq.q} className="border-border/60">
              <AccordionTrigger className="text-left text-base font-medium text-foreground hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
