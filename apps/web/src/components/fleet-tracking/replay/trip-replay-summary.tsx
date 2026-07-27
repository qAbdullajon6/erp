'use client';

import { Link } from '@tanstack/react-router';
import { useVehicle } from '@/lib/api/vehicles';
import { useDriver } from '@/lib/api/drivers';
import { useDispatchDetail } from '@/lib/hooks/use-dispatches';
import { useOrder } from '@/lib/api/orders';
import { useCustomerDetail } from '@/lib/api/customers';
import type {
  TelematicsTrip,
  TripReplayPoint,
} from '@/lib/api/telematics';
import { formatDateTime } from '@/lib/format';
import {
  formatDistanceKm,
  formatDurationSec,
  movementLabel,
} from '@/components/fleet-tracking/fleet-ops';

interface Props {
  trip: TelematicsTrip;
  currentPoint: TripReplayPoint;
  returnedPointCount: number;
}

export function TripReplaySummary({
  trip,
  currentPoint,
  returnedPointCount,
}: Props) {
  const vehicle = useVehicle(trip.vehicleId);
  const driver = useDriver(trip.driverId ?? '', { enabled: !!trip.driverId });
  const dispatch = useDispatchDetail(trip.dispatchId ?? '');
  const order = useOrder(trip.orderId ?? '');
  const customer = useCustomerDetail(order.data?.customerId ?? '');

  const vehicleName = vehicle.data
    ? [vehicle.data.plateNumber, vehicle.data.vehicleCode].filter(Boolean).join(' · ')
    : null;
  const driverName = driver.data
    ? `${driver.data.firstName} ${driver.data.lastName}`
    : null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border/60 bg-surface p-3">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Trip summary
        </h2>
        <dl className="space-y-2 text-xs">
          <SummaryRow label="Status">{trip.status}</SummaryRow>
          <SummaryRow label="Movement">
            {movementLabel(currentPoint.movementState)}
          </SummaryRow>
          <SummaryRow label="Distance">
            {formatDistanceKm(trip.distanceKm)}
          </SummaryRow>
          <SummaryRow label="Duration">
            {formatDurationSec(trip.durationSec)}
          </SummaryRow>
          <SummaryRow label="Average speed">
            {trip.avgSpeedKph != null
              ? `${Math.round(trip.avgSpeedKph)} km/h`
              : '—'}
          </SummaryRow>
          <SummaryRow label="Maximum speed">
            {trip.maxSpeedKph != null
              ? `${Math.round(trip.maxSpeedKph)} km/h`
              : '—'}
          </SummaryRow>
          <SummaryRow label="Started">{formatDateTime(trip.startedAt)}</SummaryRow>
          <SummaryRow label="Ended">{formatDateTime(trip.endedAt)}</SummaryRow>
          <SummaryRow label="Recorded points">
            {returnedPointCount.toLocaleString()}
            {trip.pointCount > returnedPointCount
              ? ` of ${trip.pointCount.toLocaleString()}`
              : ''}
          </SummaryRow>
        </dl>
      </section>

      <section className="rounded-lg border border-border/60 bg-surface p-3">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Assignment
        </h2>
        <dl className="space-y-2 text-xs">
          <SummaryRow label="Vehicle">
            {trip.vehicleId ? (
              <Link
                to="/app/vehicles/$vehicleId"
                params={{ vehicleId: trip.vehicleId }}
                className="text-brand hover:underline"
              >
                {vehicleName ?? shortId(trip.vehicleId)}
              </Link>
            ) : (
              '—'
            )}
          </SummaryRow>
          <SummaryRow label="Driver">
            {trip.driverId ? (
              <Link
                to="/app/drivers/$driverId"
                params={{ driverId: trip.driverId }}
                className="text-brand hover:underline"
              >
                {driverName ?? shortId(trip.driverId)}
              </Link>
            ) : (
              '—'
            )}
          </SummaryRow>
          <SummaryRow label="Dispatch">
            {trip.dispatchId ? (
              <Link
                to="/app/dispatches/$dispatchId"
                params={{ dispatchId: trip.dispatchId }}
                className="text-brand hover:underline"
              >
                {dispatch.data?.dispatchNumber ?? shortId(trip.dispatchId)}
              </Link>
            ) : (
              '—'
            )}
          </SummaryRow>
          <SummaryRow label="Order">
            {trip.orderId ? (
              <Link
                to="/app/orders/$orderId"
                params={{ orderId: trip.orderId }}
                className="text-brand hover:underline"
              >
                {order.data?.orderNumber ?? shortId(trip.orderId)}
              </Link>
            ) : (
              '—'
            )}
          </SummaryRow>
          <SummaryRow label="Customer">
            {order.data?.customerId ? (
              <Link
                to="/app/customers/$customerId"
                params={{ customerId: order.data.customerId }}
                className="text-brand hover:underline"
              >
                {customer.data?.companyName ?? shortId(order.data.customerId)}
              </Link>
            ) : (
              '—'
            )}
          </SummaryRow>
        </dl>
      </section>

      <section className="rounded-lg border border-border/60 bg-surface p-3">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Current recorded fix
        </h2>
        <dl className="space-y-2 text-xs">
          <SummaryRow label="Timestamp">
            {formatDateTime(currentPoint.at)}
          </SummaryRow>
          <SummaryRow label="Speed">
            {currentPoint.speedKph != null
              ? `${Math.round(currentPoint.speedKph)} km/h`
              : '—'}
          </SummaryRow>
          <SummaryRow label="Heading">
            {currentPoint.heading != null
              ? `${Math.round(currentPoint.heading)}°`
              : '—'}
          </SummaryRow>
          <SummaryRow label="Coordinates" mono>
            {currentPoint.lat.toFixed(5)}, {currentPoint.lng.toFixed(5)}
          </SummaryRow>
        </dl>
      </section>
    </div>
  );
}

function SummaryRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 text-right text-foreground ${mono ? 'font-mono text-[11px]' : ''}`}
      >
        {children}
      </dd>
    </div>
  );
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}
