import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/app/my-deliveries')({
  beforeLoad: () => {
    throw redirect({ to: '/app/driver' });
  },
});
