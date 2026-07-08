import { ClipboardList, Cpu, LineChart } from "lucide-react";

const steps = [
  {
    icon: ClipboardList,
    step: "01",
    title: "Bring in your operations",
    desc: "Import orders, drivers, and vehicles — or connect your existing systems. Onboarding runs in days, not months.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "Let the AI orchestrate",
    desc: "Smart dispatch, route optimization, and live tracking coordinate every shipment automatically.",
  },
  {
    icon: LineChart,
    step: "03",
    title: "Ask, act, scale",
    desc: "Ask the AI assistant anything about your operations. Get answers, insights, and one-click actions.",
  },
];

export function HowItWorks() {
  return (
    <section id="workflow" className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">Workflow</div>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            From chaos to command in three steps
          </h2>
          <p className="mt-4 text-muted-foreground">
            A modern operating layer for delivery businesses — no more juggling spreadsheets, chats, and legacy tools.
          </p>
        </div>

        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div className="pointer-events-none absolute inset-x-8 top-16 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {steps.map((s) => (
            <div key={s.step} className="relative rounded-2xl border border-border/60 bg-surface/60 p-6">
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand">
                  <s.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-xs font-semibold text-muted-foreground">{s.step}</span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
