import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/app/my-deliveries')({
  head: () => ({
    meta: [{ title: "My Deliveries — FlowERP AI" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: '/app/driver' });
  },
});
