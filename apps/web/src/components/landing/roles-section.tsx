import { Headset, ShieldCheck, Truck, Users, Wallet } from "lucide-react";

const roles = [
  {
    icon: ShieldCheck,
    title: "Admin",
    description: "Full visibility across orders, dispatch, finance, reports and role configuration.",
  },
  {
    icon: Headset,
    title: "Dispatcher",
    description: "Focused on assigning drivers and vehicles and keeping deliveries moving.",
  },
  {
    icon: Wallet,
    title: "Accountant",
    description: "Manages invoices, payments and expense approvals, with financial reporting.",
  },
  {
    icon: Truck,
    title: "Driver",
    description: "A simplified view of assigned deliveries with status updates from pickup to drop-off.",
  },
  {
    icon: Users,
    title: "CRM / Sales",
    description: "Manages customer relationships and creates new orders without touching dispatch or finance.",
  },
];

export function RolesSection() {
  return (
    <section id="roles" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Every team member sees the workspace built for their job
          </h2>
          <p className="mt-3 text-muted-foreground">
            Role-based views keep each person focused on what they&apos;re responsible for.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <r.icon className="size-4.5" />
              </div>
              <h3 className="font-medium">{r.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
