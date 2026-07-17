import { createFileRoute } from "@tanstack/react-router";
import { WorkflowDetail } from "@/components/workflow/workflow-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/workflows/$workflowId")({
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <WorkflowDetail workflowId={workflowId} />
    </ProtectedApiRoute>
  );
}
