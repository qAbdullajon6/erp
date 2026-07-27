'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { FormAlert } from '@/components/shared/form-alert';
import {
  usePlatformSupportTicketsQuery,
  useCreateSupportTicketMutation,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from '@/lib/api/platform';
import { formatDate } from '@/lib/format';

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES: SupportTicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function SupportList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<SupportTicketPriority>('MEDIUM');
  const [organizationId, setOrganizationId] = useState('');
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError, error, refetch } = usePlatformSupportTicketsQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
  });
  const { mutateAsync: createTicket, isPending: creating } = useCreateSupportTicketMutation();

  const items = data?.items ?? [];
  const meta = data?.meta;

  const resetCreate = () => {
    setSubject('');
    setBody('');
    setPriority('MEDIUM');
    setOrganizationId('');
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (subject.trim().length < 3 || body.trim().length < 3) {
      setFormError('Subject and body must be at least 3 characters.');
      return;
    }
    try {
      await createTicket({
        subject: subject.trim(),
        body: body.trim(),
        priority,
        organizationId: organizationId.trim() || undefined,
      });
      toast.success('Ticket created');
      setCreateOpen(false);
      resetCreate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ticket');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle={
          isLoading ? 'Loading…' : isError ? 'Error loading tickets' : `${meta?.total ?? 0} tickets`
        }
        action={
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New ticket
          </Button>
        }
      />

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Subject, body, or org…"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value as SupportTicketStatus | '');
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading tickets…" />}
        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load tickets'}
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState title="No tickets" description="Create a ticket or wait for one to arrive." />
        )}
        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Subject</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <Link
                        to="/platform/support/$ticketId"
                        params={{ ticketId: ticket.id }}
                        className="font-medium hover:text-brand"
                      >
                        {ticket.subject}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ticket.organization?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(ticket.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {meta && (
        <PaginationBar
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
        />
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) resetCreate();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support ticket</DialogTitle>
            <DialogDescription>Log an issue for platform staff to track.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <FormAlert message={formError} />}
            <div className="grid gap-2">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-body">Body</Label>
              <Textarea
                id="ticket-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={creating}
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-org">Organization ID (optional)</Label>
              <Input
                id="ticket-org"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                disabled={creating}
                placeholder="UUID"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-priority">Priority</Label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                disabled={creating}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
