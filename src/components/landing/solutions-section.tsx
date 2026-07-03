import Link from "next/link";
import { ArrowRight, BarChart3, Package, Radar, Shield, Sparkles, Users, Wallet } from "lucide-react";

const features = [
  {
    icon: Package,
    title: "Order Management",
    description: "Track every order from draft to delivery with full status history and search.",
    href: "/orders",
  },
  {
    icon: Radar,
    title: "Smart Dispatch",
    description: "Assign drivers and vehicles with capacity checks and double-booking prevention.",
    href: "/dispatch",
  },
  {
    icon: Users,
    title: "Customer CRM",
    description: "Credit limits, order history, invoices and activity timeline in one profile.",
    href: "/customers",
  },
  {
    icon: Wallet,
    title: "Finance Control",
    description: "Invoices, payments, expense approvals and order profitability in one workspace.",
    href: "/finance",
  },
  {
    icon: BarChart3,
    title: "Reports & Alerts",
    description: "Executive, operations and financial reporting alongside a live notification center.",
    href: "/reports",
  },
  {
    icon: Sparkles,
    title: "AI Operations Assistant",
    description: "Ask natural-language questions about deliveries, finance and fleet — answered from live data.",
    href: "/ai-assistant",
  },
  {
    icon: Shield,
    title: "Role-Based Workspaces",
    description: "Admin, Dispatcher, Accountant, Driver and CRM views each see only what's relevant to them.",
    href: "/",
  },
];

export function SolutionsSection() {
  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            One platform for the entire logistics workflow
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every module shares the same live data, so operations, finance and reporting always agree.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-4.5" />
              </div>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Explore <ArrowRight className="size-3" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
