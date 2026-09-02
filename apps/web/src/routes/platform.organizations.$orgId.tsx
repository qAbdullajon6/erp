import { createFileRoute } from '@tanstack/react-router';
import { OrganizationOverview } from '@/components/platform/organization-overview';

export const Route = createFileRoute('/platform/organizations/$orgId')({
  head: () => ({ meta: [{ title: 'Organization — Platform Console' }] }),
  component: OrganizationDetailPage,
});

function OrganizationDetailPage() {
  const { orgId } = Route.useParams();
  return <OrganizationOverview orgId={orgId} />;
}
