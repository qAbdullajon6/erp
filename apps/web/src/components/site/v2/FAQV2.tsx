import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * FAQ V2 - Stripe/Linear style
 *
 * Pattern: Clean accordion with smooth animations
 * Questions address real objections
 */
export function FAQV2() {
  const sectionRef = useSectionVisibility("faq");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "How long does implementation take?",
      answer:
        "Average time to full operation is 18 days. Week 1: We import your data from Excel or connect existing systems. Week 2: You run FlowERP in parallel with your current process while your team learns the platform. Week 3: You go live, and we stay with you for 2 weeks post-launch to ensure everything runs smoothly.",
    },
    {
      question: "Do I need to train my entire team?",
      answer:
        "Not really. The AI assistant means most team members can ask questions in plain language instead of learning complex software. We provide onboarding sessions for operations managers and dispatchers (2-3 hours), and drivers just need a 15-minute walkthrough of the mobile app. Most teams are productive within 2-3 days.",
    },
    {
      question: "What if our operation is too unique for software?",
      answer:
        "We've heard this before—and we've never encountered an operation we couldn't handle. FlowERP is built for logistics complexity: custom delivery windows, multi-stop routes, COD payments, proof of delivery requirements, temperature-controlled cargo, and more. If you have an edge case, we can configure the platform or build a custom integration.",
    },
    {
      question: "Can we try it before committing?",
      answer:
        "Yes. Every plan includes a 14-day free trial with no credit card required. We'll help you import sample data so you can test FlowERP with workflows that look like yours. If it's not a fit, no hard feelings—you keep your data and can export it anytime.",
    },
    {
      question: "How does the AI actually work?",
      answer:
        "The AI assistant is trained on logistics operations and has access to your live data (orders, fleet, drivers, invoices, etc.). When you ask a question like 'Which deliveries are delayed?', it queries your actual data, analyzes patterns, and responds with actionable insights. It's not generic—every answer is specific to your operation. You can also ask it to take actions like reassigning routes or drafting customer notifications.",
    },
    {
      question: "What happens to our data if we cancel?",
      answer:
        "You own your data, always. If you cancel, you can export everything (orders, customers, drivers, vehicles, invoices) in CSV or JSON format. We keep your data for 30 days in case you change your mind, then permanently delete it from our systems. No data lock-in, no hidden export fees.",
    },
    {
      question: "Do you integrate with our existing tools?",
      answer:
        "Yes. FlowERP connects with Google Maps (routing), Twilio/WhatsApp (notifications), Stripe/QuickBooks (payments), and more. We also provide a REST API and webhooks for custom integrations. Enterprise plans include dedicated integration support for legacy systems or proprietary tools.",
    },
    {
      question: "Is this built for our region?",
      answer:
        "FlowERP was built specifically for logistics operators in Central Asia, with support for local payment methods, multi-language interfaces (English, Russian, Uzbek), and region-specific route optimization. That said, the platform works globally—we have customers from Tashkent to Singapore.",
    },
  ];

  const handleToggle = (index: number) => {
    const newIndex = openIndex === index ? null : index;
    setOpenIndex(newIndex);
    if (newIndex !== null) {
      analytics.track({ name: "faq_question_click", params: { question: faqs[index].question } });
    }
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <h2 className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Frequently asked questions
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Everything you need to know about FlowERP
          </p>
        </div>

        <div className="mt-16 space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-border/60 bg-surface/40 transition-colors hover:border-brand/40"
            >
              <button
                onClick={() => handleToggle(index)}
                className="flex w-full items-center justify-between px-6 py-5 text-left"
              >
                <span className="text-lg font-semibold text-foreground">{faq.question}</span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    openIndex === index && "rotate-180"
                  )}
                />
              </button>
              {openIndex === index && (
                <div className="border-t border-border/40 px-6 py-5">
                  <p className="leading-relaxed text-muted-foreground">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Still have questions */}
        <div className="mt-16 text-center">
          <p className="text-lg text-muted-foreground">
            Still have questions?{" "}
            <button
              onClick={() => {
                analytics.track({ name: "faq_contact_click", params: {} });
                window.location.href = "mailto:support@flowerp.uz";
              }}
              className="font-semibold text-brand hover:underline"
            >
              Contact our team
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
