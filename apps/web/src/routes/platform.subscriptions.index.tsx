import { createFileRoute } from '@tanstack/react-router';
import { SubscriptionsList } from '@/components/platform/subscriptions-list';

export const Route = createFileRoute('/platform/subscriptions/')({
  head: () => ({ meta: [{ title: 'Subscriptions — Platform Console' }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  return <SubscriptionsList />;
}
