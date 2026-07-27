'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Geofence } from '@/lib/api/telematics-geofences';
import type { GeofenceEventItem } from '@/lib/api/telematics';
import {
  formatRadiusM,
  geofenceEventLabel,
  geofenceLifecycle,
  geofenceStatusClass,
  geofenceStatusLabel,
  geofenceTypeLabel,
  hasRenderableGeometry,
} from '@/components/fleet-geofences/geofences-ops';
import { Archive, Edit2, RotateCcw } from 'lucide-react';

interface Props {
  fence: Geofence | null;
  customerName: string | null;
  recentEvents: GeofenceEventItem[];
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  archiveOpen: boolean;
  onArchiveOpenChange: (open: boolean) => void;
  archivePending?: boolean;
  restorePending?: boolean;
  loading?: boolean;
}

export const GeofencesDetail = memo(function GeofencesDetail({
  fence,
  customerName,
  recentEvents,
  canWrite,
  onEdit,
  onArchive,
  onRestore,
  archiveOpen,
  onArchiveOpenChange,
  archivePending,
  restorePending,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-3 p-3" aria-busy="true">
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted/60" />
        <div className="h-24 animate-pulse rounded bg-muted/40" />
      </div>
    );
  }

  if (!fence) {
    return (
      <p className="px-3 py-8 text-center text-xs text-muted-foreground">
        Select a geofence to view details.
      </p>
    );
  }

  const status = geofenceLifecycle(fence);
  const archived = Boolean(fence.archivedAt);

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {fence.name}
          </h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {geofenceTypeLabel(fence.type)}
            {fence.category ? ` · ${fence.category}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
            geofenceStatusClass(status),
          )}
        >
          {geofenceStatusLabel(status)}
        </span>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap gap-1.5">
          {!archived ? (
            <>
              <Button size="sm" variant="outline" className="h-8" onClick={onEdit}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-destructive"
                onClick={() => onArchiveOpenChange(true)}
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Archive
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={onRestore}
              disabled={restorePending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {restorePending ? 'Restoring…' : 'Restore'}
            </Button>
          )}
        </div>
      ) : null}

      <dl className="grid gap-2 text-xs">
        <Row label="Type" value={geofenceTypeLabel(fence.type)} />
        {fence.type === 'CIRCLE' ? (
          <>
            <Row label="Radius" value={formatRadiusM(fence.radiusM)} />
            <Row
              label="Center"
              value={
                fence.centerLat != null && fence.centerLng != null
                  ? `${fence.centerLat.toFixed(5)}, ${fence.centerLng.toFixed(5)}`
                  : '—'
              }
            />
          </>
        ) : (
          <Row
            label="Vertices"
            value={
              fence.polygon
                ? String(fence.polygon.length)
                : '—'
            }
          />
        )}
        <Row label="Status" value={geofenceStatusLabel(status)} />
        <Row
          label="Linked customer"
          value={customerName ?? (fence.linkedCustomerId ? fence.linkedCustomerId.slice(0, 8) + '…' : '—')}
        />
        <Row label="Color" value={fence.color ?? '—'} />
        <Row
          label="Alerts"
          value={[
            fence.alertOnEnter ? 'Enter' : null,
            fence.alertOnExit ? 'Exit' : null,
          ]
            .filter(Boolean)
            .join(', ') || 'None'}
        />
        <Row
          label="Dwell threshold"
          value={
            fence.dwellThresholdSec != null
              ? `${fence.dwellThresholdSec}s`
              : '—'
          }
        />
        <Row
          label="Geometry"
          value={hasRenderableGeometry(fence) ? 'Ready' : 'Missing'}
        />
        <Row label="Updated" value={formatDateTime(fence.updatedAt)} />
        {fence.archivedAt ? (
          <Row label="Archived" value={formatDateTime(fence.archivedAt)} />
        ) : null}
      </dl>

      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recent events
        </h3>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recent events.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.slice(0, 8).map((event) => (
              <li
                key={event.id}
                className="rounded-md border border-border/50 px-2 py-1.5 text-[11px]"
              >
                <span className="font-medium text-foreground">
                  {geofenceEventLabel(event.type)}
                </span>
                <span className="ml-1.5 text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={onArchiveOpenChange}
        title="Archive geofence?"
        description="Archived geofences stop generating events. You can restore them later."
        confirmLabel={archivePending ? 'Archiving…' : 'Archive'}
        destructive
        onConfirm={onArchive}
      />
    </div>
  );
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
