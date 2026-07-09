import { Boxes, Lock, ShieldCheck, Zap } from "lucide-react";

/// Deliberately states what the product *is*, not invented traction numbers.
/// Every figure here is checkable against the codebase: six modules, six
/// membership roles, per-organization data isolation, one deployable API.
const FACTS = [
  {
    icon: Boxes,
    value: "6",
    label: "Connected modules",
    detail: "Orders, dispatch, customers, fleet, finance, reports — one data model, no exports.",
  },
  {
    icon: ShieldCheck,
    value: "6",
    label: "Built-in roles",
    detail: "Admins, ops managers, dispatchers, accountants, sales, and drivers each see only their work.",
  },
  {
    icon: Lock,
    value: "100%",
    label: "Tenant isolation",
    detail: "Every record is scoped to your organization and enforced server-side, not in the browser.",
  },
  {
    icon: Zap,
    value: "Live",
    label: "Operational status",
    detail: "Dispatch board, delay alerts, and receivables update as your team works.",
  },
];

export function ProofBand() {
  return (
    <section className="relative border-t border-border/60 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <span className="inline-flex rounded-xl bg-brand/10 p-2.5 text-brand">
                <fact.icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-3xl font-semibold leading-none text-foreground">{fact.value}</p>
              <p className="mt-2 text-sm font-medium text-foreground">{fact.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{fact.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
