'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LoadingState, EmptyState } from '@/components/shared/list-states';
import {
  driverWorkspaceAPI,
  useDriverInspectionQuery,
  useDriverInspectionsQuery,
} from '@/lib/api/driver-workspace';
import { Button } from '@/components/ui/button';

export function DriverInspectionHistory({ enabled }: { enabled: boolean }) {
  const listQ = useDriverInspectionsQuery(enabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailQ = useDriverInspectionQuery(selectedId ?? '', Boolean(selectedId));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Inspection history</h2>
      </div>
      {listQ.isLoading ? <LoadingState label="Loading inspections…" /> : null}
      {!listQ.isLoading && (listQ.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No inspections yet"
          description="Completed vehicle checks will appear here."
        />
      ) : null}
      <ul className="space-y-2">
        {(listQ.data ?? []).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left"
              onClick={() => setSelectedId(row.id)}
            >
              <p className="text-sm font-semibold text-foreground">
                {row.vehicle?.vehicleCode ?? row.vehicleId}
                {row.vehicle?.plateNumber ? ` · ${row.vehicle.plateNumber}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()} · {row.photos.length} photo
                {row.photos.length === 1 ? '' : 's'}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Inspection detail</SheetTitle>
            <SheetDescription>
              {detailQ.data?.vehicle
                ? `${detailQ.data.vehicle.vehicleCode} · ${detailQ.data.vehicle.plateNumber}`
                : 'Vehicle checklist'}
            </SheetDescription>
          </SheetHeader>
          {detailQ.isLoading ? <LoadingState label="Loading…" /> : null}
          {detailQ.data ? (
            <div className="mt-4 space-y-4 pb-8">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(detailQ.data.checklist ?? {}).map(([key, ok]) => (
                  <div key={key} className="rounded-lg border border-border px-3 py-2">
                    <dt className="text-xs uppercase text-muted-foreground">{key}</dt>
                    <dd className="font-medium">{ok ? 'OK' : 'Check'}</dd>
                  </div>
                ))}
              </dl>
              {detailQ.data.odometerKm ? (
                <p className="text-sm text-muted-foreground">Odometer: {detailQ.data.odometerKm} km</p>
              ) : null}
              {detailQ.data.notes ? <p className="text-sm">{detailQ.data.notes}</p> : null}
              {detailQ.data.photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {detailQ.data.photos.map((p) => (
                    <a
                      key={p.id}
                      href={driverWorkspaceAPI.inspectionPhotoUrl(detailQ.data!.id, p.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-border"
                    >
                      <img
                        src={driverWorkspaceAPI.inspectionPhotoUrl(detailQ.data!.id, p.id)}
                        alt={p.fileName}
                        className="h-28 w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos attached.</p>
              )}
              <Button variant="outline" className="w-full" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
