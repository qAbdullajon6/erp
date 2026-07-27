import { createFileRoute } from '@tanstack/react-router';
import { SupportTicketDetail } from '@/components/platform/support-ticket-detail';

export const Route = createFileRoute('/platform/support/$ticketId')({
  head: () => ({ meta: [{ title: 'Ticket — Platform Console' }] }),
  component: SupportTicketPage,
});

function SupportTicketPage() {
  const { ticketId } = Route.useParams();
  return <SupportTicketDetail ticketId={ticketId} />;
}
