import { createFileRoute } from "@tanstack/react-router";
import { AuditLogsList } from "@/components/audit/audit-logs-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { AUDIT_ROLES } from "@/lib/role-access";
import { SettingsLayout } from "@/components/settings/settings-layout";

export const Route = createFileRoute("/app/audit-logs/")({
  head: () => ({
    meta: [{ title: "Activity log — FlowERP AI" }],
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  return (
    <ProtectedApiRoute requireRoles={AUDIT_ROLES}>
      <SettingsLayout
        activeSection="/app/audit-logs"
        title="Activity log"
        subtitle="A trail of changes made across this workspace."
      >
        <AuditLogsList />
      </SettingsLayout>
    </ProtectedApiRoute>
  );
}
