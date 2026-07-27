import { createFileRoute } from '@tanstack/react-router';
import { CustomerDetail } from '@/components/customers/customer-detail';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';
import { ALL_STAFF_ROLES } from '@/lib/role-access';

export const Route = createFileRoute('/app/customers/$customerId')({
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <CustomerDetail customerId={customerId} />
    </ProtectedApiRoute>
  );
}
