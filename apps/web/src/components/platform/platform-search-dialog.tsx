'use client';

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Building2, Car, Inbox, Search, User, UserCog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePlatformSearchQuery } from '@/lib/api/platform';
import { LoadingState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export function PlatformSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 250);
  const { data, isLoading, isFetching } = usePlatformSearchQuery(debounced, open && debounced.length >= 2);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to: to as string });
  };

  const hasResults =
    !!data &&
    (data.organizations.length > 0 ||
      data.drivers.length > 0 ||
      data.vehicles.length > 0 ||
      data.leads.length > 0 ||
      (data.users?.length ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0 sm:rounded-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Platform search</DialogTitle>
          <DialogDescription>
            Search organizations, users, drivers, vehicles, and leads
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orgs, admins, drivers, vehicles, leads…"
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {debounced.length < 2 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search across the platform.
            </p>
          )}
          {debounced.length >= 2 && (isLoading || isFetching) && !data && (
            <LoadingState label="Searching…" />
          )}
          {debounced.length >= 2 && data && !hasResults && (
            <EmptyState title="No matches" description="Try a different company name, plate, or email." />
          )}
          {data?.organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => go(`/platform/organizations/${org.id}`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
            >
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{org.name}</p>
                <p className="truncate text-xs text-muted-foreground">{org.slug}</p>
              </div>
              <StatusBadge status={org.status} />
            </button>
          ))}
          {data?.users?.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() =>
                go(
                  user.organization
                    ? `/platform/organizations/${user.organization.id}`
                    : '/platform/settings',
                )
              }
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
            >
              <UserCog className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                  {user.isPlatformAdmin
                    ? ' · Platform admin'
                    : user.organization
                      ? ` · ${user.organization.name}`
                      : ''}
                </p>
              </div>
              {user.role ? <StatusBadge status={user.role} /> : null}
            </button>
          ))}
          {data?.drivers.map((driver) => (
            <button
              key={driver.id}
              type="button"
              onClick={() => go(`/platform/organizations/${driver.organization.id}`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
            >
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{driver.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {driver.organization.name}
                  {driver.email ? ` · ${driver.email}` : ''}
                </p>
              </div>
              <StatusBadge status={driver.status} />
            </button>
          ))}
          {data?.vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => go(`/platform/organizations/${vehicle.organization.id}`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
            >
              <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{vehicle.plateNumber}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {vehicle.organization.name}
                  {vehicle.make || vehicle.model
                    ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(' ')}`
                    : ''}
                </p>
              </div>
              <StatusBadge status={vehicle.status} />
            </button>
          ))}
          {data?.leads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() =>
                go(
                  lead.convertedOrganizationId
                    ? `/platform/organizations/${lead.convertedOrganizationId}`
                    : '/platform/leads',
                )
              }
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
            >
              <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{lead.company}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {lead.name} · {lead.email}
                </p>
              </div>
              <StatusBadge status={lead.status} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
