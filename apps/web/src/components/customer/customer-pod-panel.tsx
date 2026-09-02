import { useEffect, useState } from 'react';
import { portalFetch } from '@/lib/api/portal-fetch';
import {
  usePortalOrderDeliveryProofs,
  type PortalDeliveryProof,
} from '@/lib/api/portal-orders';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileImage, Signature } from 'lucide-react';

function ProofPreview({ proof }: { proof: PortalDeliveryProof }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const isImage = proof.mimeType.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let revoked = false;
    let url: string | null = null;

    void (async () => {
      try {
        const res = await portalFetch(proof.downloadUrl, { method: 'GET' });
        if (!res.ok) {
          if (!revoked) setError(true);
          return;
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        if (!revoked) setObjectUrl(url);
      } catch {
        if (!revoked) setError(true);
      }
    })();

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [proof.downloadUrl, isImage]);

  if (!isImage) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void openAuthenticated(proof.downloadUrl, proof.fileName)}
      >
        Download {proof.fileName}
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void openAuthenticated(proof.downloadUrl, proof.fileName)}
      >
        Open file
      </Button>
    );
  }

  if (!objectUrl) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-lg border border-border/50"
      onClick={() => void openAuthenticated(proof.downloadUrl, proof.fileName)}
    >
      <img src={objectUrl} alt={proof.fileName} className="max-h-56 w-full object-contain bg-muted/30" />
    </button>
  );
}

async function openAuthenticated(url: string, fileName: string) {
  const res = await portalFetch(url, { method: 'GET' });
  if (!res.ok) return;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export function CustomerPodPanel({ orderId }: { orderId: string }) {
  const { data, isLoading, error } = usePortalOrderDeliveryProofs(orderId);

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (error || !data?.items?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Delivery proofs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.items.map((proof) => (
          <div key={proof.id} className="space-y-2 rounded-lg border border-border/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                {proof.type === 'SIGNATURE' ? (
                  <Signature className="h-3.5 w-3.5" />
                ) : (
                  <FileImage className="h-3.5 w-3.5" />
                )}
                {proof.type}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDateTime(proof.createdAt)}</span>
            </div>
            <ProofPreview proof={proof} />
            {proof.receiverName ? (
              <p className="text-sm text-muted-foreground">
                Received by {proof.receiverName}
                {proof.receiverPhone ? ` · ${proof.receiverPhone}` : ''}
              </p>
            ) : null}
            {proof.notes ? <p className="text-sm text-muted-foreground">{proof.notes}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
