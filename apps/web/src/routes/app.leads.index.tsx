import { createFileRoute, redirect } from '@tanstack/react-router';

/// Leads moved to the Platform Console — keep the old URL working.
export const Route = createFileRoute('/app/leads/')({
  head: () => ({
    meta: [{ title: "Leads — FlowERP AI" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: '/platform/leads' });
  },
});
