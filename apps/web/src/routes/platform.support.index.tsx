import { createFileRoute } from '@tanstack/react-router';
import { SupportList } from '@/components/platform/support-list';

export const Route = createFileRoute('/platform/support/')({
  head: () => ({ meta: [{ title: 'Support — Platform Console' }] }),
  component: SupportPage,
});

function SupportPage() {
  return <SupportList />;
}
