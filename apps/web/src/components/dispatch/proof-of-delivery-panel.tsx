'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Camera,
  Loader2,
  MapPin,
  Gauge,
  Signature as SignatureIcon,
  Truck,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  dispatchesAPI,
  type ProofOfDeliveryFile,
  type ProofOfDeliveryResponse,
} from '@/lib/api/dispatches';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/// Fetches the actual file bytes through the authenticated JSON API and hands
/// back a blob URL — a bare `<img src="/api/...">` cannot carry the bearer
/// token, so it would 401 on any auth-guarded route (see order-documents-panel.tsx
/// for the same pattern used for order attachments).
function AuthenticatedThumb({
  dispatchId,
  file,
  className,
}: {
  dispatchId: string;
  file: ProofOfDeliveryFile;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(false);

    void (async () => {
      try {
        const blob = await dispatchesAPI.fetchProofOfDeliveryFileBlob(dispatchId, file.id);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dispatchId, file.id]);

  if (error) {
    return (
      <div className={cn('flex items-center justify-center bg-muted/30 text-xs text-muted-foreground', className)}>
        Failed to load
      </div>
    );
  }

  if (!url) {
    return <Skeleton className={className} />;
  }

  return <img src={url} alt={file.fileName} className={cn('object-contain', className)} />;
}

function FullPreviewDialog({
  dispatchId,
  file,
  onOpenChange,
}: {
  dispatchId: string;
  file: ProofOfDeliveryFile | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{file?.fileName}</DialogTitle>
        </DialogHeader>
        {file && (
          <AuthenticatedThumb
            dispatchId={dispatchId}
            file={file}
            className="mx-auto max-h-[70vh] w-full rounded-md bg-muted/20"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

interface ProofOfDeliveryPanelProps {
  /// The proof rows always belong to a dispatch (DispatchDeliveryProof.dispatchId),
  /// so callers on the Order Detail page must resolve the order's dispatch first
  /// (same "most recent dispatch for this order" lookup orders-detail.tsx already
  /// does for its own dispatch summary card).
  dispatchId: string | null | undefined;
}

export function ProofOfDeliveryPanel({ dispatchId }: ProofOfDeliveryPanelProps) {
  const [previewFile, setPreviewFile] = useState<ProofOfDeliveryFile | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<ProofOfDeliveryResponse>({
    queryKey: ['dispatch-pod', dispatchId],
    queryFn: () => dispatchesAPI.getProofOfDelivery(dispatchId as string),
    enabled: Boolean(dispatchId),
  });

  if (!dispatchId) {
    return (
      <p className="text-sm text-muted-foreground">
        No dispatch is linked to this order yet, so there is no delivery proof to show.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <span>{error instanceof Error ? error.message : 'Failed to load proof of delivery'}</span>
        <button type="button" className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasAnyProof =
    data.photos.length > 0 ||
    data.signatures.length > 0 ||
    Boolean(data.receiverName || data.receiverPhone || data.notes || data.odometerKm);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FieldTile label="Delivery status" value={<StatusBadge status={data.status} />} />
        <FieldTile
          label="Driver"
          value={
            data.driver ? (
              <span className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                {data.driver.firstName} {data.driver.lastName}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
        />
        <FieldTile
          label="Delivery time"
          value={
            data.deliveryDateActual ? (
              formatDateTime(data.deliveryDateActual)
            ) : (
              <span className="text-muted-foreground">Not yet delivered</span>
            )
          }
        />
        <FieldTile
          label="Receiver name"
          value={data.receiverName ?? <span className="text-muted-foreground">—</span>}
        />
        <FieldTile
          label="Receiver phone"
          value={data.receiverPhone ?? <span className="text-muted-foreground">—</span>}
        />
        <FieldTile
          label="Odometer"
          value={
            data.odometerKm ? (
              <span className="flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                {data.odometerKm} km
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
        />
      </div>

      {data.notes && (
        <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Delivery notes
          </p>
          <p className="mt-1.5 text-sm text-foreground">{data.notes}</p>
        </div>
      )}

      {data.arrivalLocation && (
        <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {data.arrivalLocation.label}
          </p>
          <p className="mt-1.5 font-mono text-sm text-foreground">
            {data.arrivalLocation.lat}, {data.arrivalLocation.lng}
          </p>
        </div>
      )}

      {data.signatures.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <SignatureIcon className="h-3 w-3" />
            Signature
          </p>
          <div className="flex flex-wrap gap-3">
            {data.signatures.map((file) => (
              <button
                key={file.id}
                type="button"
                className="block overflow-hidden rounded-lg border border-border/50 bg-background"
                onClick={() => setPreviewFile(file)}
              >
                <AuthenticatedThumb dispatchId={dispatchId} file={file} className="h-32 w-56" />
              </button>
            ))}
          </div>
        </div>
      )}

      {data.photos.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Camera className="h-3 w-3" />
            Photos
            <Badge variant="outline" className="text-[10px]">
              {data.photos.length}
            </Badge>
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {data.photos.map((file) => (
              <button
                key={file.id}
                type="button"
                className="block overflow-hidden rounded-lg border border-border/50 bg-background"
                onClick={() => setPreviewFile(file)}
              >
                <AuthenticatedThumb dispatchId={dispatchId} file={file} className="h-28 w-full" />
                <p className="truncate border-t border-border/50 px-1.5 py-1 text-[10px] text-muted-foreground">
                  {formatDateTime(file.uploadedAt)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasAnyProof && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          No proof of delivery has been submitted by the driver yet.
        </p>
      )}

      <FullPreviewDialog
        dispatchId={dispatchId}
        file={previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
      />
    </div>
  );
}
