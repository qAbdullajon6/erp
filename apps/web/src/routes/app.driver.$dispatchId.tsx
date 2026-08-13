import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { DriverJobDetail } from '@/components/driver-workspace/driver-job-detail';

export const Route = createFileRoute('/app/driver/$dispatchId')({
  head: () => ({
    meta: [{ title: "Delivery — FlowERP AI" }],
  }),
  component: DriverJobPage,
});

function DriverJobPage() {
  const { dispatchId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <DriverJobDetail
      dispatchId={dispatchId}
      onBack={() => void navigate({ to: '/app/driver' })}
    />
  );
}
