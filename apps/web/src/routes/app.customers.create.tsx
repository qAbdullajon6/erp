import { createFileRoute, redirect } from '@tanstack/react-router';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';
import { CUSTOMER_WRITE_ROLES } from '@/lib/role-access';

export const Route = createFileRoute('/app/customers/create')({
  head: () => ({
    meta: [{ title: "New Customer — FlowERP AI" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: '/app/customers', search: { create: true } as const });
  },
  component: CreateCustomerRedirect,
});

function CreateCustomerRedirect() {
  return (
    <ProtectedApiRoute requireRoles={CUSTOMER_WRITE_ROLES}>
      <div className="p-6 text-sm text-muted-foreground">Opening new customer…</div>
    </ProtectedApiRoute>
  );
}
