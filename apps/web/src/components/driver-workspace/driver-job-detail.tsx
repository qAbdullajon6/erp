'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, Clock, Fuel, MapPin, Navigation, Phone, Receipt } from 'lucide-react';
import { formatDeliveryWindow } from '@/lib/format';
import { buildStopLink, findNavigationTargetStop } from '@/lib/driver/stop-nav';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { describeError, isConflict } from '@/lib/api/describe-error';
import { useMyDeliveryQuery, type DriverActionableStatus, type DriverDispatchStop } from '@/lib/api/my-deliveries';
import type { DispatchStatus } from '@/lib/api/my-deliveries';
import {
  useDriverProofsQuery,
  useDriverStatusMutation,
  useDriverWorkspaceProfileQuery,
} from '@/lib/api/driver-workspace';
import { isOfflineQueuedResult } from '@/lib/driver/offline-queue';
import { useDriverLocation } from '@/lib/driver/location-provider';
import { DriverAcceptRejectActions } from './driver-accept-reject-actions';
import { DriverStickyActions } from './driver-sticky-actions';
import { DriverPodChecklistSheet } from './driver-pod-checklist-sheet';
import { DriverExpenseSheet } from './driver-expense-sheet';
import { DriverFuelSheet } from './driver-fuel-sheet';
import { DriverInspectionSheet } from './driver-inspection-sheet';
import { DriverOfflineBanner } from './driver-offline-banner';
import { DriverFailureReportSheet } from './driver-failure-report-sheet';
import { DriverIntermediateStopFailureSheet } from './driver-intermediate-stop-failure-sheet';
import { DELIVERY_FAILURE_REASON_LABELS } from '@/lib/api/my-deliveries';

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
  AT_STOP: 'At stop',
  ARRIVED_AT_DELIVERY: 'Arrived at delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  DELIVERY_FAILED: 'Delivery failed',
};

const LIVE_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_STOP', 'ARRIVED_AT_DELIVERY']);

type StopExecutionState = 'upcoming' | 'active' | 'completed' | 'failed';

function getStopExecutionState(stop: DriverDispatchStop, _dispatchStatus: DispatchStatus): StopExecutionState {
  if (stop.failedAt) return 'failed';
  if (stop.completedAt) return 'completed';
  if (stop.arrivedAt) return 'active';
  return 'upcoming';
}


interface Props {
  dispatchId: string;
  onBack: () => void;
}

export function DriverJobDetail({ dispatchId, onBack }: Props) {
  const { data: delivery, isLoading, isError, error, refetch } = useMyDeliveryQuery(dispatchId);
  const profileQ = useDriverWorkspaceProfileQuery(true);
  const statusMutation = useDriverStatusMutation(dispatchId);
  const { location, refresh } = useDriverLocation({ watch: true });
  const proofsQ = useDriverProofsQuery(dispatchId, delivery?.status === 'IN_TRANSIT' || delivery?.status === 'ARRIVED_AT_DELIVERY');

  const [podOpen, setPodOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [failureReportOpen, setFailureReportOpen] = useState(false);
  const [intermediateStopFailureOpen, setIntermediateStopFailureOpen] = useState(false);
  const [gpsWarnOpen, setGpsWarnOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<DriverActionableStatus | null>(null);

  const applyStatus = async (next: DriverActionableStatus, withLocation: boolean) => {
    try {
      const result =
        withLocation && location
          ? await statusMutation.mutateAsync({ status: next, lat: location.lat, lng: location.lng })
          : await statusMutation.mutateAsync({ status: next });
      if (!isOfflineQueuedResult(result)) {
        toast.success(`Marked as ${STATUS_LABELS[next] ?? next}`);
      }
    } catch (err) {
      toast.error(describeError(err, 'Failed to update status'));
      if (isConflict(err)) {
        void refetch();
      }
    } finally {
      setPendingStatus(null);
      setGpsWarnOpen(false);
    }
  };

  const handleAdvanceStatus = async (next: DriverActionableStatus) => {
    refresh();
    if ((next === 'AT_PICKUP' || next === 'ARRIVED_AT_DELIVERY') && !location) {
      setPendingStatus(next);
      setGpsWarnOpen(true);
      toast.warning('Location unavailable — you can still mark arrived');
      return;
    }
    await applyStatus(next, Boolean(location));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <LoadingState label="Loading job…" />
      </div>
    );
  }

  if (isError || !delivery) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load delivery'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const canShareLocation = LIVE_STATUSES.has(delivery.status);
  const pickupNavLink = buildStopLink(
    delivery.order.pickupAddress,
    delivery.order.pickupCity,
    delivery.order.pickupLat,
    delivery.order.pickupLng,
    'navigate',
  );
  const pickupMapLink = buildStopLink(
    delivery.order.pickupAddress,
    delivery.order.pickupCity,
    delivery.order.pickupLat,
    delivery.order.pickupLng,
    'map',
  );
  const deliveryNavLink = buildStopLink(
    delivery.order.deliveryAddress,
    delivery.order.deliveryCity,
    delivery.order.deliveryLat,
    delivery.order.deliveryLng,
    'navigate',
  );
  const deliveryMapLink = buildStopLink(
    delivery.order.deliveryAddress,
    delivery.order.deliveryCity,
    delivery.order.deliveryLat,
    delivery.order.deliveryLng,
    'map',
  );
  const intermediateNavStop = findNavigationTargetStop(delivery.status, delivery.stops);
  const nextStopNav =
    delivery.status === 'ASSIGNED' ||
    delivery.status === 'EN_ROUTE_TO_PICKUP' ||
    delivery.status === 'AT_PICKUP'
      ? pickupNavLink
      : intermediateNavStop
        ? buildStopLink(intermediateNavStop.address, intermediateNavStop.city, intermediateNavStop.lat, intermediateNavStop.lng, 'navigate')
        : deliveryNavLink;

  const checklist = profileQ.data?.podChecklist ?? {
    requirePhotos: true,
    requireSignature: true,
    requireReceiverName: true,
    requireReceiverPhone: false,
    requireNotes: false,
  };

  const isInTransit = delivery.status === 'IN_TRANSIT';
  const isArrivedAtDelivery = delivery.status === 'ARRIVED_AT_DELIVERY';
  const isDeliveryFailed = delivery.status === 'DELIVERY_FAILED';
  const activeIntermediateStop = delivery.status === 'AT_STOP'
    ? delivery.stops.find(
        (s) => s.stopType === 'INTERMEDIATE' && s.arrivedAt != null && s.completedAt == null && s.failedAt == null,
      ) ?? null
    : null;
  const proofItems = proofsQ.data?.items ?? [];
  const hasPhoto = proofItems.some((p) => p.type === 'PHOTO' && p.fileSize > 0);
  const hasSig = proofItems.some((p) => p.type === 'SIGNATURE');
  const hasReceiverName = proofItems.some((p) => Boolean(p.receiverName?.trim()));
  const podComplete =
    (!checklist.requirePhotos || hasPhoto) &&
    (!checklist.requireSignature || hasSig) &&
    (!checklist.requireReceiverName || hasReceiverName);

  return (
    <div className="space-y-4 pb-40">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to workspace
      </button>

      <DriverOfflineBanner />

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-foreground">
              {delivery.dispatchNumber}
            </h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{delivery.order.orderNumber}</p>
          </div>
          <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
            {STATUS_LABELS[delivery.status] ?? delivery.status}
          </span>
        </div>
        {delivery.driverAcceptanceStatus === 'ACCEPTED' ? (
          <p className="mt-2 text-xs text-success">Accepted</p>
        ) : delivery.driverAcceptanceStatus === 'REJECTED' ? (
          <p className="mt-2 text-xs text-destructive">Rejected</p>
        ) : null}
        {nextStopNav ? (
          <a
            href={nextStopNav}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground"
          >
            <Navigation className="h-4 w-4" />
            Navigate to next stop
          </a>
        ) : null}
      </div>

      <DriverAcceptRejectActions
        delivery={delivery}
        onRejected={onBack}
      />

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pickup</h2>
        {delivery.order.pickupPlaceName ? (
          <>
            <p className="mt-2 font-semibold text-foreground">{delivery.order.pickupPlaceName}</p>
            <p className="text-sm text-muted-foreground">
              {delivery.order.pickupAddress}, {delivery.order.pickupCity}
            </p>
          </>
        ) : (
          <p className="mt-2 font-medium text-foreground">
            {delivery.order.pickupAddress}, {delivery.order.pickupCity}
          </p>
        )}
        {(delivery.order.pickupPostalCode || delivery.order.pickupCountryCode) ? (
          <p className="text-sm text-muted-foreground">
            {[delivery.order.pickupPostalCode, delivery.order.pickupCountryCode].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(delivery.pickupDateScheduled).toLocaleString()}
        </p>
        {delivery.order.pickupWindowStart && delivery.order.pickupWindowEnd ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {formatDeliveryWindow(delivery.order.pickupWindowStart, delivery.order.pickupWindowEnd)}
          </p>
        ) : null}
        {(delivery.order.pickupContactName || delivery.order.pickupContactPhone) ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pickup contact
            </p>
            {delivery.order.pickupContactName ? (
              <p className="mt-1 text-sm text-foreground">{delivery.order.pickupContactName}</p>
            ) : null}
            {delivery.order.pickupContactPhone ? (
              <a
                href={`tel:${delivery.order.pickupContactPhone}`}
                className="mt-1 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {delivery.order.pickupContactPhone}
              </a>
            ) : null}
          </div>
        ) : null}
        {delivery.order.pickupInstructions ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Instructions
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {delivery.order.pickupInstructions}
            </p>
          </div>
        ) : null}
        {pickupMapLink ? (
          <a
            href={pickupMapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Open pickup in Maps
          </a>
        ) : null}
      </div>

      {delivery.stops.filter((s) => s.stopType === 'INTERMEDIATE').map((stop) => {
        const state = getStopExecutionState(stop, delivery.status as DispatchStatus);
        const stopMapLink = buildStopLink(stop.address, stop.city, stop.lat, stop.lng, 'map');
        return (
          <div key={stop.id} className={`rounded-xl border bg-surface p-5 ${state === 'active' ? 'border-brand' : state === 'completed' ? 'border-success/40' : state === 'failed' ? 'border-destructive/40' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Stop {stop.stopIndex}
              </h2>
              {state === 'completed' && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
              {state === 'active' && <span className="text-xs font-medium text-brand">Current stop</span>}
              {state === 'failed' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Failed
                </span>
              )}
            </div>
            {stop.placeName ? (
              <>
                <p className="mt-2 font-semibold text-foreground">{stop.placeName}</p>
                <p className="text-sm text-muted-foreground">{stop.address}, {stop.city}</p>
              </>
            ) : (
              <p className="mt-2 font-medium text-foreground">{stop.address}, {stop.city}</p>
            )}
            {(stop.postalCode || stop.countryCode) ? (
              <p className="text-sm text-muted-foreground">
                {[stop.postalCode, stop.countryCode].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            {stop.windowStart && stop.windowEnd ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {formatDeliveryWindow(stop.windowStart, stop.windowEnd)}
              </p>
            ) : null}
            {stop.arrivedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">Arrived: {new Date(stop.arrivedAt).toLocaleTimeString()}</p>
            ) : null}
            {stop.completedAt ? (
              <p className="text-xs text-muted-foreground">Departed: {new Date(stop.completedAt).toLocaleTimeString()}</p>
            ) : null}
            {stop.failedAt ? (
              <p className="mt-1 text-xs text-destructive">Failed: {new Date(stop.failedAt).toLocaleTimeString()}</p>
            ) : null}
            {(stop.failureReason || stop.failureNotes) ? (
              <div className="mt-2 rounded-md bg-destructive/5 px-3 py-2 space-y-0.5">
                {stop.failureReason ? (
                  <p className="text-xs font-medium text-destructive">{stop.failureReason}</p>
                ) : null}
                {stop.failureNotes ? (
                  <p className="text-xs text-muted-foreground">{stop.failureNotes}</p>
                ) : null}
              </div>
            ) : null}
            {(stop.contactName || stop.contactPhone) ? (
              <div className="mt-3 border-t border-border/50 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                {stop.contactName ? (
                  <p className="mt-1 text-sm text-foreground">{stop.contactName}</p>
                ) : null}
                {stop.contactPhone ? (
                  <a
                    href={`tel:${stop.contactPhone}`}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {stop.contactPhone}
                  </a>
                ) : null}
              </div>
            ) : null}
            {stop.instructions ? (
              <div className="mt-3 border-t border-border/50 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Instructions</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{stop.instructions}</p>
              </div>
            ) : null}
            {stopMapLink ? (
              <a
                href={stopMapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
              >
                <MapPin className="h-4 w-4" />
                Open stop in Maps
              </a>
            ) : null}
          </div>
        );
      })}

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Delivery</h2>
        {delivery.order.deliveryPlaceName ? (
          <>
            <p className="mt-2 font-semibold text-foreground">{delivery.order.deliveryPlaceName}</p>
            <p className="text-sm text-muted-foreground">
              {delivery.order.deliveryAddress}, {delivery.order.deliveryCity}
            </p>
          </>
        ) : (
          <p className="mt-2 font-medium text-foreground">
            {delivery.order.deliveryAddress}, {delivery.order.deliveryCity}
          </p>
        )}
        {(delivery.order.deliveryPostalCode || delivery.order.deliveryCountryCode) ? (
          <p className="text-sm text-muted-foreground">
            {[delivery.order.deliveryPostalCode, delivery.order.deliveryCountryCode].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(delivery.deliveryDateScheduled).toLocaleString()}
        </p>
        {delivery.order.deliveryWindowStart && delivery.order.deliveryWindowEnd ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {formatDeliveryWindow(delivery.order.deliveryWindowStart, delivery.order.deliveryWindowEnd)}
          </p>
        ) : null}
        {delivery.order.deliveryNotes ? (
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
            <p className="mt-1 text-sm text-muted-foreground">{delivery.order.deliveryNotes}</p>
          </div>
        ) : null}
        {(delivery.order.deliveryContactName || delivery.order.deliveryContactPhone) ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery contact
            </p>
            {delivery.order.deliveryContactName ? (
              <p className="mt-1 text-sm text-foreground">{delivery.order.deliveryContactName}</p>
            ) : null}
            {delivery.order.deliveryContactPhone ? (
              <a
                href={`tel:${delivery.order.deliveryContactPhone}`}
                className="mt-1 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {delivery.order.deliveryContactPhone}
              </a>
            ) : null}
          </div>
        ) : null}
        {delivery.order.deliveryInstructions ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Instructions
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {delivery.order.deliveryInstructions}
            </p>
          </div>
        ) : null}
        {deliveryMapLink ? (
          <a
            href={deliveryMapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Open delivery in Maps
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
        <p className="mt-2 font-medium text-foreground">{delivery.customer.companyName}</p>
        <p className="text-sm text-muted-foreground">{delivery.customer.contactName}</p>
        {delivery.customer.phone ? (
          <a
            href={`tel:${delivery.customer.phone}`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <Phone className="h-4 w-4" />
            {delivery.customer.phone}
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cargo</h2>
        <p className="mt-2 text-foreground">{delivery.order.cargoDescription}</p>
        <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
          {delivery.order.cargoWeightKg ? <span>{delivery.order.cargoWeightKg} kg</span> : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Vehicle: {delivery.vehicle.plateNumber} ({delivery.vehicle.type})
        </p>
      </div>

      {delivery.statusHistory && delivery.statusHistory.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Status timeline
          </h2>
          <div className="mt-3 space-y-3">
            {delivery.statusHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between border-b border-border/60 pb-2 last:border-0"
              >
                <span className="text-sm font-medium text-foreground">
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isArrivedAtDelivery && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-3">
          <p className="text-sm font-medium text-warning">
            Arrived at delivery — complete POD and confirm delivery when ready.
          </p>
          <button
            type="button"
            onClick={() => setFailureReportOpen(true)}
            className="text-sm font-medium text-destructive underline underline-offset-2"
          >
            Could not deliver? Report failed delivery
          </button>
        </div>
      )}

      {isDeliveryFailed && delivery.failureReason && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-destructive">Delivery failed</p>
          <p className="text-sm text-destructive/80">
            {DELIVERY_FAILURE_REASON_LABELS[delivery.failureReason] ?? delivery.failureReason}
          </p>
          {delivery.failureNotes && (
            <p className="text-sm text-muted-foreground">{delivery.failureNotes}</p>
          )}
        </div>
      )}

      {(isInTransit || isArrivedAtDelivery) && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            POD checklist
          </h2>
          <div className="mt-3 space-y-2">
            {checklist.requirePhotos && (
              <div className="flex items-center gap-2 text-sm">
                {hasPhoto ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className={hasPhoto ? 'text-foreground' : 'text-destructive'}>
                  {hasPhoto ? 'Delivery photo' : 'Delivery photo required'}
                </span>
              </div>
            )}
            {checklist.requireSignature && (
              <div className="flex items-center gap-2 text-sm">
                {hasSig ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className={hasSig ? 'text-foreground' : 'text-destructive'}>
                  {hasSig ? 'Signature' : 'Signature required'}
                </span>
              </div>
            )}
            {checklist.requireReceiverName && (
              <div className="flex items-center gap-2 text-sm">
                {hasReceiverName ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className={hasReceiverName ? 'text-foreground' : 'text-destructive'}>
                  {hasReceiverName ? 'Recipient name' : 'Recipient name required'}
                </span>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => setPodOpen(true)}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            {podComplete ? 'Review POD' : 'Complete POD'}
          </Button>
        </div>
      )}

      <DriverStickyActions
        allowedTransitions={delivery.allowedTransitions}
        canShareLocation={canShareLocation}
        isPending={statusMutation.isPending}
        onAdvance={(next) => void handleAdvanceStatus(next)}
        deliveredDisabled={(isInTransit || isArrivedAtDelivery) && !podComplete}
        currentStatus={delivery.status}
        onFailureReport={activeIntermediateStop ? () => setIntermediateStopFailureOpen(true) : undefined}
        extraActions={
          delivery.driverAcceptanceStatus === 'ACCEPTED' ? (
            <div className="grid grid-cols-4 gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setPodOpen(true)}>
                <ClipboardCheck className="h-3.5 w-3.5" />
                POD
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setFuelOpen(true)}>
                <Fuel className="h-3.5 w-3.5" />
                Fuel
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setExpenseOpen(true)}>
                <Receipt className="h-3.5 w-3.5" />
                Exp
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setInspectionOpen(true)}>
                <ClipboardCheck className="h-3.5 w-3.5" />
                Insp
              </Button>
            </div>
          ) : null
        }
      />

      <DriverPodChecklistSheet
        open={podOpen}
        onOpenChange={setPodOpen}
        dispatchId={delivery.id}
        checklist={checklist}
      />
      <DriverFuelSheet
        open={fuelOpen}
        onOpenChange={setFuelOpen}
        dispatchId={delivery.id}
        vehicleId={delivery.vehicle.id}
      />
      <DriverExpenseSheet
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        dispatchId={delivery.id}
        vehicleId={delivery.vehicle.id}
      />
      <DriverInspectionSheet
        open={inspectionOpen}
        onOpenChange={setInspectionOpen}
        vehicleId={delivery.vehicle.id}
        dispatchId={delivery.id}
      />

      {failureReportOpen && (
        <DriverFailureReportSheet
          dispatchId={delivery.id}
          onClose={() => setFailureReportOpen(false)}
        />
      )}

      {intermediateStopFailureOpen && activeIntermediateStop ? (
        <DriverIntermediateStopFailureSheet
          dispatchId={delivery.id}
          stopId={activeIntermediateStop.id}
          stopIndex={activeIntermediateStop.stopIndex}
          onClose={() => setIntermediateStopFailureOpen(false)}
        />
      ) : null}

      <AlertDialog open={gpsWarnOpen} onOpenChange={setGpsWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Location not available</AlertDialogTitle>
            <AlertDialogDescription>
              GPS could not be read for arrival. You can still mark Arrived without coordinates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatus) void applyStatus(pendingStatus, false);
              }}
            >
              Continue without GPS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
