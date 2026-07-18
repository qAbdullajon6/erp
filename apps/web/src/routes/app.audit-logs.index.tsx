import { createFileRoute } from "@tanstack/react-router";
import { AuditLogsList } from "@/components/audit/audit-logs-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { AUDIT_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/audit-logs/")({
  component: AuditLogsPage,
});

function AuditLogsPage() {
  return (
    <ProtectedApiRoute requireRoles={AUDIT_ROLES}>
      <AuditLogsList />
    </ProtectedApiRoute>
  );
}
