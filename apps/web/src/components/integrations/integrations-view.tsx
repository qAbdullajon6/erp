import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import {
  useIntegrationProvidersQuery,
  useIntegrationsQuery,
  useIntegrationsHealthQuery,
  useIntegrationLogsQuery,
  useConnectIntegrationMutation,
  useDisconnectIntegrationMutation,
  useSyncIntegrationMutation,
  useTestIntegrationConnectionMutation,
} from '@/lib/api/integrations';
import type { IntegrationInstance, IntegrationProviderInfo } from '@/lib/api/integrations-types';
import { formatRelativeTime } from '@/lib/format';
import { Plug, RefreshCw, Wand2, FileText } from 'lucide-react';

const STATUS_VARIANT: Record<IntegrationInstance['status'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  CONNECTED: 'success',
  CONNECTING: 'warning',
  DISCONNECTED: 'secondary',
  ERROR: 'destructive',
  EXPIRED: 'destructive',
};

function schemaFields(schema: Record<string, unknown>): Array<{ key: string; description?: string; default?: string; required: boolean }> {
  const properties = (schema?.properties ?? {}) as Record<string, { description?: string; default?: unknown }>;
  const required = new Set((schema?.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([key, def]) => ({
    key,
    description: def?.description,
    default: def?.default !== undefined ? String(def.default) : undefined,
    required: required.has(key),
  }));
}

function ConnectDialog({
  provider,
  onOpenChange,
}: {
  provider: IntegrationProviderInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const connectMutation = useConnectIntegrationMutation();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');

  const fields = useMemo(() => (provider ? schemaFields(provider.configurationSchema) : []), [provider]);

  const handleClose = (open: boolean) => {
    if (!open) {
      setConfig({});
      setDisplayName('');
    }
    onOpenChange(open);
  };

  const handleConnect = () => {
    if (!provider) return;
    const missing = fields.filter((f) => f.required && !config[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Missing required field: ${missing[0].key}`);
      return;
    }
    connectMutation.mutate(
      { providerKey: provider.providerKey, config, displayName: displayName || undefined },
      {
        onSuccess: () => {
          toast.success(`${provider.displayName} connected`);
          handleClose(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to connect'),
      },
    );
  };

  return (
    <Dialog open={!!provider} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect {provider?.displayName}</DialogTitle>
          <DialogDescription>{provider?.description}</DialogDescription>
        </DialogHeader>
        {provider && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Display name (optional)</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={provider.displayName}
                className="mt-1"
              />
            </div>
            {fields.map((field) => (
              <div key={field.key}>
                <label className="text-sm font-medium text-foreground">
                  {field.key}
                  {field.required && <span className="text-destructive"> *</span>}
                </label>
                <Input
                  value={config[field.key] ?? field.default ?? ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.description}
                  className="mt-1"
                />
                {field.description && <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={connectMutation.isPending}>
            {connectMutation.isPending ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogsDialog({ integration, onOpenChange }: { integration: IntegrationInstance | null; onOpenChange: (open: boolean) => void }) {
  const { data: logs, isLoading, isError } = useIntegrationLogsQuery(integration?.id ?? '', 50, !!integration);

  return (
    <Dialog open={!!integration} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{integration?.displayName} — recent logs</DialogTitle>
        </DialogHeader>
        {isLoading && <Skeleton className="h-40 rounded-lg" />}
        {isError && <p className="text-sm text-destructive">Failed to load logs.</p>}
        {!isLoading && !isError && (logs?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No log entries yet.</p>
        )}
        {!isLoading && logs && logs.length > 0 && (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-brand/10 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'}>{log.level}</Badge>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
                </div>
                <p className="mt-1 font-medium text-foreground">{log.event}</p>
                {log.message && <p className="mt-1 text-muted-foreground">{log.message}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationsView() {
  const { data: integrations, isLoading, isError, refetch } = useIntegrationsQuery();
  const { data: providers } = useIntegrationProvidersQuery();
  const { data: health } = useIntegrationsHealthQuery();

  const disconnectMutation = useDisconnectIntegrationMutation();
  const syncMutation = useSyncIntegrationMutation();
  const testMutation = useTestIntegrationConnectionMutation();

  const [connectProvider, setConnectProvider] = useState<IntegrationProviderInfo | null>(null);
  const [logsFor, setLogsFor] = useState<IntegrationInstance | null>(null);

  const connectedProviderKeys = new Set((integrations ?? []).map((i) => i.providerKey));
  const availableProviders = (providers ?? []).filter((p) => !connectedProviderKeys.has(p.providerKey));

  const handleDisconnect = (id: string, name: string) => {
    disconnectMutation.mutate(id, {
      onSuccess: () => toast.success(`${name} disconnected`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to disconnect'),
    });
  };

  const handleSync = (id: string) => {
    syncMutation.mutate(id, {
      onSuccess: (result) => toast.success(`Synced ${result.recordsProcessed} record${result.recordsProcessed === 1 ? '' : 's'}`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Sync failed'),
    });
  };

  const handleTest = (id: string) => {
    testMutation.mutate(id, {
      onSuccess: (result) => (result.success ? toast.success(result.message) : toast.error(result.message)),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Connection test failed'),
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Integrations</h1>
        <p className="mt-2 text-muted-foreground">Connect and manage third-party providers</p>
      </div>

      {health && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold text-foreground">{health.summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold text-success">{health.summary.healthy}</p>
              <p className="text-xs text-muted-foreground">Healthy</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold text-warning">{health.summary.degraded}</p>
              <p className="text-xs text-muted-foreground">Degraded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold text-destructive">{health.summary.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected integrations</CardTitle>
          <CardDescription>Providers currently connected to your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-40 rounded-lg" />}
          {isError && <ErrorState message="Failed to load integrations" onRetry={() => refetch()} />}
          {!isLoading && !isError && (integrations?.length ?? 0) === 0 && (
            <EmptyState title="No integrations connected" description="Connect a provider below to get started." />
          )}
          {!isLoading && integrations && integrations.length > 0 && (
            <div className="space-y-3">
              {integrations.map((integration) => (
                <div key={integration.id} className="rounded-lg border border-brand/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{integration.displayName}</p>
                        <Badge variant={STATUS_VARIANT[integration.status]}>{integration.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {integration.type} · {integration.providerKey}
                        {integration.lastSyncAt && ` · Last synced ${formatRelativeTime(integration.lastSyncAt)}`}
                        {integration.errorCount > 0 && ` · ${integration.errorCount} error${integration.errorCount === 1 ? '' : 's'}`}
                      </p>
                      {integration.errorMessage && (
                        <p className="mt-1 text-xs text-destructive">{integration.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTest(integration.id)} disabled={testMutation.isPending}>
                        <Wand2 className="mr-1 h-3.5 w-3.5" />
                        Test
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSync(integration.id)} disabled={syncMutation.isPending}>
                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        Sync
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setLogsFor(integration)}>
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        Logs
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                            Disconnect
                          </Button>
                        }
                        title={`Disconnect ${integration.displayName}?`}
                        description="This will stop syncing data through this provider until it's reconnected."
                        confirmLabel="Disconnect"
                        onConfirm={() => handleDisconnect(integration.id, integration.displayName)}
                        destructive
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {availableProviders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-muted-foreground" />
              Available providers
            </CardTitle>
            <CardDescription>Connect a new provider to your organization.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableProviders.map((provider) => (
              <div key={provider.providerKey} className="rounded-lg border border-brand/10 p-4">
                <p className="font-medium text-foreground">{provider.displayName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{provider.type}</p>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{provider.description}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setConnectProvider(provider)}>
                  Connect
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConnectDialog provider={connectProvider} onOpenChange={(open) => !open && setConnectProvider(null)} />
      <LogsDialog integration={logsFor} onOpenChange={(open) => !open && setLogsFor(null)} />
    </div>
  );
}
