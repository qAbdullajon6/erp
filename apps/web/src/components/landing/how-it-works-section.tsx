import { Package, Radar, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Package,
    step: "1",
    title: "Create Order",
    description: "Capture cargo details, pickup and delivery dates, and the agreed price in one form.",
  },
  {
    icon: Radar,
    step: "2",
    title: "Assign Driver & Vehicle",
    description: "Dispatch checks vehicle capacity and availability before confirming the assignment.",
  },
  {
    icon: TrendingUp,
    step: "3",
    title: "Track Delivery, Finance & Performance",
    description: "Follow status through delivery, generate invoices, record payments and review reports.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t border-border/60 bg-muted/20 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            A single workflow that carries every order from intake through to reporting.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.step} className="relative rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {s.step}
                </div>
                <s.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-medium">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.description}</p>
              {i < steps.length - 1 && (
                <div className="absolute top-11 right-[-12px] hidden h-px w-6 bg-border sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
