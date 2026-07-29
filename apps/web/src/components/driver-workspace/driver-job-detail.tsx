'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardCheck, Fuel, MapPin, Navigation, Phone, Receipt } from 'lucide-react';
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
import { describeError } from '@/lib/api/describe-error';
import { useMyDeliveryQuery, type DriverActionableStatus } from '@/lib/api/my-deliveries';
import {
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

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const LIVE_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT']);

function mapLink(address: string, city: string): string | null {
  const query = [address, city].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function navLink(address: string, city: string): string | null {
  const query = [address, city].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
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

  const [podOpen, setPodOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
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
    } finally {
      setPendingStatus(null);
      setGpsWarnOpen(false);
    }
  };

  const handleAdvanceStatus = async (next: DriverActionableStatus) => {
    refresh();
    if (next === 'AT_PICKUP' && !location) {
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
  const pickupNav = navLink(delivery.order.pickupAddress, delivery.order.pickupCity);
  const deliveryNav = navLink(delivery.order.deliveryAddress, delivery.order.deliveryCity);
  const nextStopNav =
    delivery.status === 'ASSIGNED' ||
    delivery.status === 'EN_ROUTE_TO_PICKUP' ||
    delivery.status === 'AT_PICKUP'
      ? pickupNav
      : deliveryNav;

  const checklist = profileQ.data?.podChecklist ?? {
    requirePhotos: true,
    requireSignature: true,
    requireReceiverName: true,
    requireReceiverPhone: false,
    requireNotes: false,
  };

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
        <p className="mt-2 font-medium text-foreground">
          {delivery.order.pickupAddress}, {delivery.order.pickupCity}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(delivery.pickupDateScheduled).toLocaleString()}
        </p>
        {mapLink(delivery.order.pickupAddress, delivery.order.pickupCity) ? (
          <a
            href={mapLink(delivery.order.pickupAddress, delivery.order.pickupCity)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Open pickup in Maps
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Delivery</h2>
        <p className="mt-2 font-medium text-foreground">
          {delivery.order.deliveryAddress}, {delivery.order.deliveryCity}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(delivery.deliveryDateScheduled).toLocaleString()}
        </p>
        {delivery.order.deliveryNotes ? (
          <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.order.deliveryNotes}</p>
        ) : null}
        {mapLink(delivery.order.deliveryAddress, delivery.order.deliveryCity) ? (
          <a
            href={mapLink(delivery.order.deliveryAddress, delivery.order.deliveryCity)!}
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

      <DriverStickyActions
        allowedTransitions={delivery.allowedTransitions}
        canShareLocation={canShareLocation}
        isPending={statusMutation.isPending}
        onAdvance={(next) => void handleAdvanceStatus(next)}
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
