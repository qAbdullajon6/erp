import { createFileRoute } from '@tanstack/react-router';
import { OrganizationsList } from '@/components/platform/organizations-list';

export const Route = createFileRoute('/platform/organizations/')({
  head: () => ({ meta: [{ title: 'Organizations — Platform Console' }] }),
  component: OrganizationsPage,
});

function OrganizationsPage() {
  return <OrganizationsList />;
}
