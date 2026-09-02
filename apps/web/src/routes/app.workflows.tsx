import { createFileRoute } from "@tanstack/react-router";
import { WorkflowList } from "@/components/workflow/workflow-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";
import { SettingsLayout } from "@/components/settings/settings-layout";

export const Route = createFileRoute("/app/workflows")({
  head: () => ({
    meta: [{ title: "Automation — FlowERP AI" }],
  }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <SettingsLayout
        activeSection="/app/workflows"
        title="Automation"
        subtitle="Manage automated rules for assigning drivers and handling exceptions."
      >
        <WorkflowList />
      </SettingsLayout>
    </ProtectedApiRoute>
  );
}
