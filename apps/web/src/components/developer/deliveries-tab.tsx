import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useWebhooksQuery,
  useDeliveriesQuery,
  useDeliveryQuery,
  useReplayDeliveryMutation,
  useRetryDeliveryMutation,
  type WebhookDeliveryAttempt,
} from '@/lib/api/developer';

const STATUS_BADGE: Record<string, 'default' | 'outline' | 'secondary' | 'destructive'> = {
  PENDING: 'outline',
  DELIVERING: 'secondary',
  DELIVERED: 'default',
  FAILED: 'destructive',
};

export function DeliveriesTab() {
  const { data: webhooksData } = useWebhooksQuery();
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: deliveriesData, isLoading } = useDeliveriesQuery(selectedWebhookId);
  const { data: deliveryDetail } = useDeliveryQuery(selectedWebhookId, selectedDeliveryId);
  const { mutateAsync: replay } = useReplayDeliveryMutation(selectedWebhookId ?? '');
  const { mutateAsync: retry } = useRetryDeliveryMutation(selectedWebhookId ?? '');

  const webhooks = webhooksData?.items ?? [];
  const deliveries = deliveriesData?.items ?? [];

  const handleReplay = async (deliveryId: string) => {
    try {
      setBusy(true);
      const result = await replay(deliveryId);
      toast.success(`Replay queued (new delivery: ${result.newDeliveryId.slice(0, 8)}...)`);
      setSelectedDeliveryId(result.newDeliveryId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to replay delivery');
    } finally {
      setBusy(false);
    }
  };

  /// Retry re-queues the SAME delivery (continuing its attempt history);
  /// replay forks a new one from the same payload. Only a FAILED delivery can
  /// be retried — the server answers anything else with a 409.
  const handleRetry = async (deliveryId: string) => {
    try {
      setBusy(true);
      const result = await retry(deliveryId);
      if (result.status === 'DELIVERED') {
        toast.success(`Retry succeeded — HTTP ${result.httpStatus}`);
      } else {
        toast.error(`Retry failed: ${result.errorMessage ?? result.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to retry delivery');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium shrink-0">Webhook:</label>
        <select
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
          value={selectedWebhookId ?? ''}
          onChange={(e) => { setSelectedWebhookId(e.target.value || null); setSelectedDeliveryId(null); }}
        >
          <option value="">Select a webhook...</option>
          {webhooks.map((wh) => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
      </div>

      {!selectedWebhookId ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Select a webhook to view its delivery history
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : deliveries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No deliveries yet for this webhook
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Delivery History</h3>
            {deliveries.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDeliveryId(d.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted ${selectedDeliveryId === d.id ? 'border-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{d.id.slice(0, 8)}...</span>
                  <Badge variant={STATUS_BADGE[d.status] ?? 'outline'} className="text-xs">{d.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Event: {d.event}</p>
                <p className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</p>
                {d.httpStatus && <p className="text-xs text-muted-foreground">HTTP {d.httpStatus}</p>}
              </button>
            ))}
          </div>

          <div>
            {selectedDeliveryId && deliveryDetail ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Delivery Details</h3>
                  <div className="flex gap-2">
                    {deliveryDetail.status === 'FAILED' && (
                      <Button size="sm" onClick={() => handleRetry(deliveryDetail.id)} disabled={busy}>
                        {busy ? '...' : 'Retry'}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleReplay(deliveryDetail.id)} disabled={busy}>
                      {busy ? '...' : 'Replay'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">ID:</span> <span className="font-mono text-xs">{deliveryDetail.id}</span></div>
                  <div><span className="font-medium">Event:</span> {deliveryDetail.event}</div>
                  <div><span className="font-medium">Status:</span> <Badge variant={STATUS_BADGE[deliveryDetail.status] ?? 'outline'} className="text-xs">{deliveryDetail.status}</Badge></div>
                  <div><span className="font-medium">HTTP Status:</span> {deliveryDetail.httpStatus ?? '-'}</div>
                  <div><span className="font-medium">Attempts:</span> {deliveryDetail.attemptCount}</div>
                  <div><span className="font-medium">Created:</span> {new Date(deliveryDetail.createdAt).toLocaleString()}</div>
                  {deliveryDetail.completedAt && <div><span className="font-medium">Completed:</span> {new Date(deliveryDetail.completedAt).toLocaleString()}</div>}
                  {deliveryDetail.failedAt && <div><span className="font-medium">Failed:</span> {new Date(deliveryDetail.failedAt).toLocaleString()}</div>}
                  {deliveryDetail.replayOfId && (
                    <div>
                      <span className="font-medium">Replay of:</span>{' '}
                      <button
                        className="font-mono text-xs text-primary underline"
                        onClick={() => setSelectedDeliveryId(deliveryDetail.replayOfId)}
                      >
                        {deliveryDetail.replayOfId.slice(0, 8)}...
                      </button>
                    </div>
                  )}
                  {deliveryDetail.errorMessage && (
                    <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      {deliveryDetail.errorMessage}
                    </div>
                  )}
                </div>

                {/* The exact body that was sent. This is what makes a failed
                    delivery diagnosable rather than merely reported. */}
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Payload</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(deliveryDetail.payload, null, 2)}
                  </pre>
                </details>

                {deliveryDetail.deliveryAttempts.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Attempts</h4>
                    <div className="space-y-2">
                      {deliveryDetail.deliveryAttempts.map((a: WebhookDeliveryAttempt) => (
                        <div key={a.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Attempt #{a.attemptNumber}</span>
                            <Badge variant={a.status === 'SUCCESS' ? 'default' : 'destructive'} className="text-xs">{a.status}</Badge>
                          </div>
                          {a.httpStatus && <p className="mt-1 text-xs text-muted-foreground">HTTP {a.httpStatus}</p>}
                          {a.durationMs !== null && <p className="text-xs text-muted-foreground">{a.durationMs}ms</p>}
                          {a.errorMessage && <p className="mt-1 text-xs text-destructive">{a.errorMessage}</p>}
                          {a.responseBody && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-muted-foreground">Response</summary>
                              <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">{a.responseBody}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Select a delivery to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
