import { createFileRoute } from '@tanstack/react-router';
import { LeadsList } from '@/components/leads/leads-list';

export const Route = createFileRoute('/platform/leads/')({
  head: () => ({ meta: [{ title: 'Leads — Platform Console' }] }),
  component: PlatformLeadsPage,
});

function PlatformLeadsPage() {
  return <LeadsList />;
}
