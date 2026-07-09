import { createFileRoute } from '@tanstack/react-router';
import { CustomerCreateForm } from '@/components/customers/customer-create-form';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';

export const Route = createFileRoute('/app/customers/create')({
  component: CreateCustomerPage,
});

function CreateCustomerPage() {
  return (
    <ProtectedApiRoute>
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold text-foreground">Create Customer</h1>
        <p className="mt-2 text-muted-foreground">Add a new customer to your organization</p>
        <div className="mt-8">
          <CustomerCreateForm />
        </div>
      </div>
    </ProtectedApiRoute>
  );
}
