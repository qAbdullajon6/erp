import { createFileRoute } from '@tanstack/react-router';
import { AuditList } from '@/components/platform/audit-list';

export const Route = createFileRoute('/platform/audit/')({
  head: () => ({ meta: [{ title: 'Audit — Platform Console' }] }),
  component: AuditPage,
});

function AuditPage() {
  return <AuditList />;
}
