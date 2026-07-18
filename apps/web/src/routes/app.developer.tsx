import { createFileRoute } from "@tanstack/react-router";
import { DeveloperView } from "@/components/developer/developer-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/developer")({
  head: () => ({
    meta: [{ title: "Developer — FlowERP AI" }],
  }),
  component: DeveloperPage,
});

/// Architecture review fix: this route had no ProtectedApiRoute wrapper at
/// all (every sibling role-gated route does, even the currently-broken
/// no-op version) — a plain inconsistency that would have been silently
/// missed if this file were fixed alongside the other 24 mechanically.
function DeveloperPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <DeveloperView />
    </ProtectedApiRoute>
  );
}
