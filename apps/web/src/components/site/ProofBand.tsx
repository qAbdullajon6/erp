/**
 * Proof Band - Social proof and platform facts
 *
 * Shows verifiable platform capabilities and statistics.
 * Redesigned with premium card design matching the rest of the landing page.
 */

import { Boxes, Lock, ShieldCheck, Zap } from "lucide-react";

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
    <section className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((fact) => {
            const Icon = fact.icon;
            return (
              <div
                key={fact.label}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface/40 p-6 transition-all hover:-translate-y-1 hover:border-brand/40 hover:bg-surface hover:shadow-xl"
              >
                {/* Hover glow effect */}
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand/20 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />

                <div className="relative">
                  {/* Icon */}
                  <div className="inline-flex rounded-xl bg-brand/15 p-3 text-brand">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>

                  {/* Value */}
                  <p className="mt-5 font-display text-4xl font-bold leading-none text-foreground">
                    {fact.value}
                  </p>

                  {/* Label */}
                  <p className="mt-3 text-sm font-semibold text-foreground">{fact.label}</p>

                  {/* Detail */}
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{fact.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
