'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { DetailField } from '@/components/shared/detail-field';
import { FormAlert } from '@/components/shared/form-alert';
import {
  usePlatformHealthQuery,
  usePlatformWorkersQuery,
  usePlatformQueuesQuery,
  usePlatformFeatureFlagsQuery,
  useCreateFeatureFlagMutation,
  useUpdateFeatureFlagMutation,
} from '@/lib/api/platform';

export function SystemView() {
  const [createOpen, setCreateOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabledGlobal, setEnabledGlobal] = useState(false);
  const [formError, setFormError] = useState('');

  const health = usePlatformHealthQuery();
  const workers = usePlatformWorkersQuery();
  const queues = usePlatformQueuesQuery();
  const flags = usePlatformFeatureFlagsQuery();
  const { mutateAsync: createFlag, isPending: creating } = useCreateFeatureFlagMutation();
  const { mutate: updateFlag, isPending: updating } = useUpdateFeatureFlagMutation();

  const resetCreate = () => {
    setKey('');
    setName('');
    setDescription('');
    setEnabledGlobal(false);
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim().length < 2 || name.trim().length < 2) {
      setFormError('Key and name must be at least 2 characters.');
      return;
    }
    try {
      await createFlag({
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        enabledGlobal,
      });
      toast.success('Feature flag created');
      setCreateOpen(false);
      resetCreate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create flag');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="System" subtitle="Health, workers, queues, and feature flags" />

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="queues">Queues</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          {health.isLoading && <LoadingState label="Checking health…" />}
          {health.isError && (
            <ErrorState
              message={health.error instanceof Error ? health.error.message : 'Health check failed'}
              onRetry={() => health.refetch()}
            />
          )}
          {health.data && (
            <div className="grid gap-4 rounded-lg border border-brand/10 p-6 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Status" value={<StatusBadge status={health.data.status} />} />
              <DetailField label="Database" value={health.data.database} />
              <DetailField label="Redis" value={health.data.redis} />
              <DetailField label="Version" value={health.data.version} />
              <DetailField label="Commit" value={health.data.commit} mono />
              <DetailField label="Uptime (s)" value={health.data.uptimeSeconds} />
              <DetailField label="Latency (ms)" value={health.data.latencyMs} />
              <DetailField label="Checked at" value={health.data.checkedAt} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="workers" className="mt-4">
          {workers.isLoading && <LoadingState label="Loading workers…" />}
          {workers.isError && (
            <ErrorState
              message={workers.error instanceof Error ? workers.error.message : 'Failed to load workers'}
              onRetry={() => workers.refetch()}
            />
          )}
          {workers.data && (
            <ul className="divide-y divide-border rounded-lg border border-brand/10">
              {workers.data.items.map((w) => (
                <li key={w.name} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium">{w.name}</p>
                    <p className="text-sm text-muted-foreground">{w.detail}</p>
                  </div>
                  <StatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="queues" className="mt-4">
          {queues.isLoading && <LoadingState label="Loading queues…" />}
          {queues.isError && (
            <ErrorState
              message={queues.error instanceof Error ? queues.error.message : 'Failed to load queues'}
              onRetry={() => queues.refetch()}
            />
          )}
          {queues.data && (
            <ul className="divide-y divide-border rounded-lg border border-brand/10">
              {queues.data.items.map((q) => (
                <li key={q.name} className="grid gap-2 px-4 py-3 sm:grid-cols-4">
                  <p className="font-medium sm:col-span-1">{q.name}</p>
                  <p className="text-sm text-muted-foreground">Pending: {q.pending}</p>
                  <p className="text-sm text-muted-foreground">Failed: {q.failed}</p>
                  <p className="text-sm text-muted-foreground">Sent: {q.sent}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="flags" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create flag
            </Button>
          </div>
          {flags.isLoading && <LoadingState label="Loading flags…" />}
          {flags.isError && (
            <ErrorState
              message={flags.error instanceof Error ? flags.error.message : 'Failed to load flags'}
              onRetry={() => flags.refetch()}
            />
          )}
          {flags.data && flags.data.length === 0 && (
            <EmptyState title="No feature flags" description="Create a flag to gate platform features." />
          )}
          {flags.data && flags.data.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-brand/10">
              {flags.data.map((flag) => (
                <li key={flag.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{flag.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{flag.key}</p>
                    {flag.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{flag.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={flag.scope} />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={flag.enabledGlobal}
                        disabled={updating}
                        onCheckedChange={(checked) =>
                          updateFlag(
                            { id: flag.id, input: { enabledGlobal: checked } },
                            {
                              onSuccess: () => toast.success('Flag updated'),
                              onError: (err) =>
                                toast.error(err instanceof Error ? err.message : 'Update failed'),
                            },
                          )
                        }
                        aria-label={`Enable ${flag.key} globally`}
                      />
                      <span className="text-xs text-muted-foreground">Global</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) resetCreate();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create feature flag</DialogTitle>
            <DialogDescription>Keys are normalized to lowercase with underscores.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <FormAlert message={formError} />}
            <div className="grid gap-2">
              <Label htmlFor="flag-key">Key</Label>
              <Input id="flag-key" value={key} onChange={(e) => setKey(e.target.value)} disabled={creating} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="flag-name">Name</Label>
              <Input id="flag-name" value={name} onChange={(e) => setName(e.target.value)} disabled={creating} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="flag-desc">Description</Label>
              <Input
                id="flag-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={enabledGlobal}
                onCheckedChange={setEnabledGlobal}
                disabled={creating}
                id="flag-enabled"
              />
              <Label htmlFor="flag-enabled">Enabled globally</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
