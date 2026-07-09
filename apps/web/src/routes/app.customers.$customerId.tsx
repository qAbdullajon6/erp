import { createFileRoute } from '@tanstack/react-router';
import { CustomerDetail } from '@/components/customers/customer-detail';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';

export const Route = createFileRoute('/app/customers/$customerId')({
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  return (
    <ProtectedApiRoute>
      <CustomerDetail customerId={customerId} />
    </ProtectedApiRoute>
  );
}
