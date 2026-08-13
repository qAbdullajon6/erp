import { createFileRoute } from "@tanstack/react-router";
import { BillingView } from "@/components/billing/billing-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_ONLY_ROLES } from "@/lib/role-access";

const BILLING_TABS = ["overview", "plans", "subscription", "usage", "providers", "settings"] as const;

export type BillingTab = (typeof BILLING_TABS)[number];

export type BillingSearch = {
  tab?: BillingTab;
};

export const Route = createFileRoute("/app/billing")({
  head: () => ({
    meta: [{ title: "Billing — FlowERP" }],
  }),
  validateSearch: (search: Record<string, unknown>): BillingSearch => {
    const tab = search.tab;
    return {
      tab: (BILLING_TABS as readonly unknown[]).includes(tab) ? (tab as BillingTab) : undefined,
    };
  },
  component: BillingPage,
});

/// Billing management is ADMIN-only, matching SubscriptionsController and
/// PlansController's admin routes (both @Roles("ADMIN")). Gating here keeps a
/// non-ADMIN from navigating directly to the URL and hitting a render-then-403.
function BillingPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_ONLY_ROLES}>
      <BillingView />
    </ProtectedApiRoute>
  );
}
