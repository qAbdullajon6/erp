import { createFileRoute } from '@tanstack/react-router';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';
import { TripReplayWorkspace } from '@/components/fleet-tracking/replay/trip-replay-workspace';
import { FLEET_ROLES } from '@/lib/role-access';

export const Route = createFileRoute(
  '/app/fleet-tracking_/replay/$tripId',
)({
  head: () => ({
    meta: [{ title: 'Trip Replay — FlowERP' }],
  }),
  component: TripReplayPage,
});

/// TripsController uses ADMIN/OPERATIONS_MANAGER/DISPATCHER for list, detail,
/// and replay. Keep direct route access in lockstep with that guard.
function TripReplayPage() {
  const { tripId } = Route.useParams();

  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <TripReplayWorkspace tripId={tripId} />
    </ProtectedApiRoute>
  );
}
