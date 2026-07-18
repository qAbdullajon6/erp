import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  useWebhooksQuery,
  useWebhookEventsQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useEnableWebhookMutation,
  useDisableWebhookMutation,
  useRotateWebhookSecretMutation,
  useTestWebhookMutation,
  type WebhookEndpoint,
} from '@/lib/api/developer';

export function WebhooksTab() {
  const { data, isLoading, isError, refetch } = useWebhooksQuery();
  const { data: eventsData } = useWebhookEventsQuery();
  const { mutateAsync: create, isPending: isCreating } = useCreateWebhookMutation();
  const { mutateAsync: update, isPending: isUpdating } = useUpdateWebhookMutation();
  const { mutateAsync: remove } = useDeleteWebhookMutation();
  const { mutateAsync: enable } = useEnableWebhookMutation();
  const { mutateAsync: disable } = useDisableWebhookMutation();
  const { mutateAsync: rotateSecret } = useRotateWebhookSecretMutation();
  const { mutateAsync: test } = useTestWebhookMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<{ raw: string; name: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const availableEvents = eventsData?.items ?? [];

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormEvents([]);
    setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    setNewSecret(null);
    setDialogOpen(true);
  };

  /// Edit was previously unreachable: setEditId existed but nothing called it,
  /// and the dialog was gated on `showCreate && !editId` so it could not have
  /// rendered the edit form even if something had.
  const openEdit = (wh: WebhookEndpoint) => {
    setEditId(wh.id);
    setFormName(wh.name);
    setFormUrl(wh.url);
    setFormEvents(wh.events);
    setNewSecret(null);
    setDialogOpen(true);
  };

  const toggleEvent = (event: string, checked: boolean) => {
    setFormEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)));
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await update({ id: editId, input: { name: formName, url: formUrl, events: formEvents } });
        toast.success('Webhook updated');
        resetForm();
        setDialogOpen(false);
      } else {
        const result = await create({ name: formName, url: formUrl, events: formEvents });
        // Hold the dialog open on the reveal step — the secret is returned
        // exactly once, so closing here would lose it silently.
        setNewSecret({ raw: result.secret ?? '', name: result.name });
        resetForm();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save webhook');
    }
  };

  const handleTest = async (id: string) => {
    try {
      setTestingId(id);
      const result = await test({ id });
      if (result.status === 'DELIVERED') {
        toast.success(`Test delivered — HTTP ${result.httpStatus} in ${result.durationMs}ms`);
      } else {
        toast.error(`Test failed: ${result.errorMessage ?? `status ${result.status}`}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send test delivery');
    } finally {
      setTestingId(null);
    }
  };

  // Architecture review fix: was window.confirm() — see api-keys-tab.tsx's
  // handleRevoke for why this codebase's ConfirmDialog replaces it.
  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      toast.success('Webhook deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      if (active) await disable(id);
      else await enable(id);
      toast.success(active ? 'Webhook disabled' : 'Webhook enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle webhook');
    }
  };

  const handleRotateSecret = async (id: string, name: string) => {
    try {
      const result = await rotateSecret(id);
      setNewSecret({ raw: result.secret ?? '', name });
      // The reveal lives in the dialog, so rotating from the list has to open
      // it — otherwise the new secret is returned and immediately discarded.
      setDialogOpen(true);
      toast.success("Secret rotated — copy it now, it won't be shown again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rotate secret');
    }
  };

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;
  if (isError) return (
    <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
      Failed to load webhooks
      <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">Retry</Button>
    </div>
  );

  const webhooks = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{webhooks.length} endpoint{webhooks.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={openCreate}>Add Webhook</Button>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => { setDialogOpen(open); if (!open) { resetForm(); setNewSecret(null); } }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{newSecret ? 'Webhook Secret' : editId ? 'Edit Webhook' : 'Add Webhook'}</DialogTitle>
            </DialogHeader>
            {newSecret ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  Signing secret for "{newSecret.name}". Copy it now — it will not be shown again.
                </div>
                <div className="rounded-md border bg-muted p-3 font-mono text-sm break-all select-all">
                  {newSecret.raw}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => { void navigator.clipboard.writeText(newSecret.raw); toast.success('Copied'); }}
                  >
                    Copy to Clipboard
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setNewSecret(null); setDialogOpen(false); }}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateOrUpdate} className="space-y-4">
                <div>
                  <label className="text-sm font-medium" htmlFor="wh-name">Name</label>
                  <Input id="wh-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My Webhook" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="wh-url">URL</label>
                  <Input id="wh-url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com/hook" className="mt-1" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Must be a public https endpoint. Private and loopback addresses are rejected.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Events</label>
                  {/* Checkboxes over the server's own event list, replacing a
                      free-text comma field — a typo there produced a 400 that
                      the user had no way to anticipate. */}
                  <div className="mt-1 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2">
                    {availableEvents.map((event) => (
                      <label key={event} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={formEvents.includes(event)}
                          onChange={(e) => toggleEvent(event, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="truncate font-mono text-xs">{event}</span>
                      </label>
                    ))}
                  </div>
                  {formEvents.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Select at least one event.</p>
                  )}
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCreating || isUpdating || !formName.trim() || !formUrl.trim() || formEvents.length === 0}
                >
                  {isCreating || isUpdating ? 'Saving...' : editId ? 'Update' : 'Create'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No webhook endpoints yet.
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{wh.name}</p>
                    <Badge variant={wh.isActive ? 'default' : 'outline'} className="text-xs">
                      {wh.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{wh.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <Badge key={ev} variant="secondary" className="text-xs">{ev}</Badge>
                    ))}
                  </div>
                  {wh.lastSuccessAt && (
                    <p className="mt-1 text-xs text-green-600">Last success: {new Date(wh.lastSuccessAt).toLocaleString()}</p>
                  )}
                  {wh.lastFailureAt && (
                    <p className="mt-1 text-xs text-destructive">Last failure: {new Date(wh.lastFailureAt).toLocaleString()}</p>
                  )}
                  {wh.lastFailureReason && (
                    <p className="text-xs text-muted-foreground">{wh.lastFailureReason}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleTest(wh.id)} disabled={testingId === wh.id}>
                    {testingId === wh.id ? 'Testing...' : 'Test'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(wh)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggle(wh.id, wh.isActive)}>
                    {wh.isActive ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleRotateSecret(wh.id, wh.name)}>
                    Rotate Secret
                  </Button>
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="destructive">Delete</Button>}
                    title="Delete webhook?"
                    description={`Delete "${wh.name}"? It will stop receiving events immediately, and its delivery history will be removed. This cannot be undone.`}
                    confirmLabel="Delete"
                    onConfirm={() => handleDelete(wh.id)}
                    destructive
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
