import { createFileRoute } from "@tanstack/react-router";
import { WorkflowList } from "@/components/workflow/workflow-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/workflows")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <WorkflowList />
    </ProtectedApiRoute>
  );
}
