import { createFileRoute } from "@tanstack/react-router";
import { BillingView } from "@/components/billing/billing-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_ONLY_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/billing")({
  head: () => ({
    meta: [{ title: "Billing — FlowERP" }],
  }),
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
