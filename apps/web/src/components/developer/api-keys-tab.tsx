import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
  useRotateApiKeyMutation,
  useSetApiKeyEnabledMutation,
  type ApiKey,
  type ApiKeyStatus,
} from '@/lib/api/developer';
import { useCurrentUser } from '@/lib/api/auth';
import type { MembershipRole } from '@/lib/api/organizations';
import { ADMIN_OPS_ROLES } from '@/lib/role-access';

/// Must stay in lockstep with API_KEY_SCOPES in
/// apps/api/src/developer/api-keys/dto/api-key.dto.ts — the server rejects
/// anything outside that set with a 400.
const AVAILABLE_SCOPES = [
  'orders:read',
  'orders:write',
  'customers:read',
  'customers:write',
  'drivers:read',
  'vehicles:read',
  'telematics:read',
  'finance:read',
  'webhooks:admin',
];

const STATUS_BADGE: Record<ApiKeyStatus, 'default' | 'outline' | 'destructive'> = {
  ACTIVE: 'default',
  DISABLED: 'outline',
  REVOKED: 'destructive',
};

/// A key is expired when its expiry has passed. Shown as a distinct state
/// because the server rejects an expired key while its status still reads
/// ACTIVE — without this the UI would claim a dead key is live.
function isExpired(key: ApiKey): boolean {
  return key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now();
}

export function ApiKeysTab() {
  const { data: currentUser } = useCurrentUser();
  const { data, isLoading, isError, refetch } = useApiKeysQuery();
  const { mutateAsync: createKey, isPending: isCreating } = useCreateApiKeyMutation();
  const { mutateAsync: revokeKey } = useRevokeApiKeyMutation();
  const { mutateAsync: rotateKey } = useRotateApiKeyMutation();
  const { mutateAsync: setEnabled } = useSetApiKeyEnabledMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [newExpiry, setNewExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Matches ApiKeysController's role guard (ADMIN or OPERATIONS_MANAGER) —
  // this used to be stricter (ADMIN-only) than the backend actually allows.
  const isAdmin = !!currentUser && ADMIN_OPS_ROLES.includes(currentUser.membership.role as MembershipRole);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const result = await createKey({
        name: newName.trim(),
        scopes: newScopes,
        expiresAt: newExpiry || undefined,
      });
      setCreatedKey(result);
      setNewName('');
      setNewScopes([]);
      setNewExpiry('');
      toast.success('API key created — copy it now, it won\'t be shown again');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    }
  };

  // Architecture review fix: was window.confirm(), which blocks the event
  // loop and can't be styled — this codebase's own ConfirmDialog exists
  // specifically to replace that pattern (see layout/user-menu.tsx) and is
  // used everywhere else for destructive actions.
  const handleRevoke = async (id: string) => {
    try {
      await revokeKey(id);
      toast.success('API key revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const handleRotate = async (id: string) => {
    try {
      setRotatingId(id);
      const result = await rotateKey(id);
      toast.success("Key rotated — copy the new key now, it won't be shown again");
      // Reuse the create dialog's reveal step: rotate returns a rawKey on the
      // same one-time-visibility terms as create.
      setCreatedKey(result);
      setShowCreate(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rotate key');
    } finally {
      setRotatingId(null);
    }
  };

  const handleToggle = async (id: string, currentlyActive: boolean) => {
    try {
      setTogglingId(id);
      await setEnabled({ id, enabled: !currentlyActive });
      toast.success(currentlyActive ? 'API key disabled' : 'API key enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update API key');
    } finally {
      setTogglingId(null);
    }
  };

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;
  if (isError) return (
    <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
      Failed to load API keys
      <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">Retry</Button>
    </div>
  );

  const keys = data?.items ?? [];
  // "Active" must mean what the server means: a revoked/disabled/expired key
  // authenticates nothing, and counting it here told the operator they had
  // working credentials they did not have.
  const activeCount = keys.filter((k) => k.status === 'ACTIVE' && !isExpired(k)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active key{activeCount !== 1 ? 's' : ''}
          {keys.length !== activeCount && ` · ${keys.length - activeCount} inactive`}
        </p>
        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open);
            // Drop the revealed secret from memory on close. It is unreadable
            // from here on anyway (the server never returns it again), so
            // holding it in state past the dialog serves nothing.
            if (!open) setCreatedKey(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" disabled={!isAdmin}>Create API Key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdKey ? 'API Key Created' : 'Create API Key'}</DialogTitle>
            </DialogHeader>
            {createdKey?.rawKey ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  Copy this key now. You won't be able to see it again.
                </div>
                <div>
                  <label className="text-sm font-medium">Your API Key</label>
                  <div className="mt-1 rounded-md border bg-muted p-3 font-mono text-sm break-all select-all">
                    {createdKey.rawKey}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(createdKey.rawKey!);
                      toast.success('Copied');
                    }}
                  >
                    Copy to Clipboard
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setCreatedKey(null); setShowCreate(false); }}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My API Key" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Scopes</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label key={scope} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={newScopes.includes(scope)}
                          onChange={(e) => {
                            setNewScopes(e.target.checked ? [...newScopes, scope] : newScopes.filter((s) => s !== scope));
                          }}
                          className="rounded border-gray-300"
                        />
                        {scope}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Expires At (optional)</label>
                  <Input type="datetime-local" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} className="mt-1" />
                </div>
                <Button type="submit" size="sm" disabled={isCreating || !newName.trim()}>
                  {isCreating ? 'Creating...' : 'Create Key'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No API keys yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => {
            const revoked = key.status === 'REVOKED';
            const expired = isExpired(key);
            return (
              <div key={key.id} className={`rounded-lg border p-4 ${revoked ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{key.name}</p>
                      <Badge variant={STATUS_BADGE[key.status]} className="text-xs">{key.status}</Badge>
                      {expired && !revoked && (
                        <Badge variant="destructive" className="text-xs">EXPIRED</Badge>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{key.keyPrefix}...</p>
                    {key.expiresAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {expired ? 'Expired' : 'Expires'} {new Date(key.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {key.lastUsedAt
                        ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                        : 'Never used'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Rate limit: {key.rateLimitPerMinute}/min
                    </p>
                  </div>
                  {/* A revoked key is terminal — offering Rotate/Disable on it
                      would surface buttons the server answers with a 409. */}
                  {!revoked && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggle(key.id, key.status === 'ACTIVE')}
                        disabled={togglingId === key.id}
                      >
                        {togglingId === key.id
                          ? '...'
                          : key.status === 'ACTIVE'
                            ? 'Disable'
                            : 'Enable'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRotate(key.id)} disabled={rotatingId === key.id}>
                        {rotatingId === key.id ? 'Rotating...' : 'Rotate'}
                      </Button>
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="destructive">Revoke</Button>}
                        title="Revoke API key?"
                        description={`Revoke "${key.name}"? Any integration using this key will stop working immediately. This cannot be undone.`}
                        confirmLabel="Revoke"
                        onConfirm={() => handleRevoke(key.id)}
                        destructive
                      />
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {key.scopes.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No scopes — this key can read nothing</span>
                  ) : (
                    key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="text-xs">{scope}</Badge>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
