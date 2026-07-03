import { Boxes, Clock, FileWarning, Radar, Truck } from "lucide-react";

const problems = [
  {
    icon: Boxes,
    title: "Orders scattered across tools",
    description:
      "Order details end up split across spreadsheets, chat threads and phone calls, making it hard to see the full picture.",
  },
  {
    icon: Clock,
    title: "Delivery delays go unnoticed",
    description:
      "Without a live view of delivery dates and statuses, delays are often discovered by the customer before the team.",
  },
  {
    icon: Radar,
    title: "Manual dispatching",
    description:
      "Assigning drivers and vehicles by memory or messaging app makes it easy to double-book resources or miss capacity limits.",
  },
  {
    icon: FileWarning,
    title: "Unpaid invoices pile up",
    description:
      "Without a consolidated view of invoices and payments, overdue balances and at-risk customers are easy to miss.",
  },
  {
    icon: Truck,
    title: "Limited fleet visibility",
    description:
      "Vehicle maintenance schedules and driver availability are hard to track consistently across a growing fleet.",
  },
];

export function ProblemsSection() {
  return (
    <section id="problems" className="border-t border-border/60 bg-muted/20 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Running logistics on scattered tools is slow and error-prone
          </h2>
          <p className="mt-3 text-muted-foreground">
            These are the day-to-day friction points FlowERP AI is designed to remove.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <p.icon className="size-4.5" />
              </div>
              <h3 className="font-medium">{p.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
