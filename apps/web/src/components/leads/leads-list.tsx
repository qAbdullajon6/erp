'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import {
  useLeadsQuery,
  useLeadQuery,
  useLeadStatsQuery,
  useUpdateLeadStatusMutation,
  LEAD_STATUSES,
  LEAD_STATUS_DESCRIPTIONS,
  type Lead,
  type LeadStatus,
} from '@/lib/api/leads';
import { useResendLeadInvitationMutation } from '@/lib/api/platform';
import { useCurrentUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Mail, Phone, ShieldOff, RefreshCw } from 'lucide-react';
import { ConvertLeadWizard } from '@/components/leads/convert-lead-wizard';
import { LeadTimeline } from '@/components/leads/lead-timeline';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

export function LeadsList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  const { data: currentUser, loading: userLoading } = useCurrentUser();
  const allowed = currentUser?.user.isPlatformAdmin === true;

  const { data, isLoading, isError, error, refetch } = useLeadsQuery(
    {
      page,
      limit: 20,
      search: search || undefined,
      status: statusFilter || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    allowed,
  );
  const { data: counts } = useLeadStatsQuery(allowed);
  const { data: detailLead, isLoading: detailLoading } = useLeadQuery(detailLeadId, allowed);
  const { mutate: updateStatus, isPending: updating } = useUpdateLeadStatusMutation();
  const { mutateAsync: resendInvite, isPending: resending } = useResendLeadInvitationMutation();

  const items = data?.items ?? [];
  const meta = data?.meta;

  const handleStatusChange = (id: string, status: LeadStatus) =>
    updateStatus(
      { id, status },
      {
        onSuccess: () => toast.success(`Lead moved to ${statusLabel(status)}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update lead'),
      },
    );

  if (userLoading) return <LoadingState label="Loading..." />;

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leads" />
        <div className="flex flex-col items-center justify-center rounded-lg border border-brand/10 py-20 text-center">
          <div className="rounded-full bg-muted p-3">
            <ShieldOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 font-medium text-foreground">This screen is for FlowERP staff</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Demo requests from the marketing site are not part of your organization's data, so no
            role within it can open them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle={
          isLoading ? 'Loading...' : isError ? 'Error loading leads' : `${meta?.total ?? 0} demo requests`
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {LEAD_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter((current) => (current === status ? '' : status));
              setPage(1);
            }}
            className={`rounded-xl border p-3 text-left transition-colors sm:p-4 ${
              statusFilter === status
                ? 'border-brand/40 bg-brand/10'
                : 'border-brand/10 bg-surface hover:border-brand/30'
            }`}
          >
            <StatusBadge status={status} />
            <p className="mt-2 text-2xl font-semibold leading-none text-foreground sm:mt-3">
              {counts?.[status] ?? 0}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              {LEAD_STATUS_DESCRIPTIONS[status]}
            </p>
          </button>
        ))}
      </div>

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Company, contact name, or email..."
        searchTestId="leads-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as LeadStatus | '');
            setPage(1);
          }}
          testId="leads-status-filter"
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading leads..." />}

        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load leads'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            title="No leads yet"
            description={
              search || statusFilter
                ? 'No demo request matches the current filters.'
                : 'Demo requests from the marketing site land here.'
            }
          />
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table data-testid="leads-table">
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden md:table-cell">Message</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lead) => {
                  const converted = Boolean(lead.convertedOrganizationId);
                  return (
                    <TableRow
                      key={lead.id}
                      data-testid="lead-row"
                      className="cursor-pointer"
                      onClick={() => setDetailLeadId(lead.id)}
                    >
                      <TableCell className="font-medium text-foreground">{lead.company}</TableCell>

                      <TableCell>
                        <div className="text-foreground">{lead.name}</div>
                        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                          <a
                            href={`mailto:${lead.email}`}
                            className="flex items-center gap-1.5 hover:text-brand"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="h-3 w-3 shrink-0" />
                            {lead.email}
                          </a>
                          <a
                            href={`tel:${lead.phone}`}
                            className="flex items-center gap-1.5 hover:text-brand"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3 shrink-0" />
                            {lead.phone}
                          </a>
                        </div>
                      </TableCell>

                      <TableCell className="hidden max-w-xs md:table-cell">
                        <p className="truncate text-muted-foreground" title={lead.message ?? undefined}>
                          {lead.message || '—'}
                        </p>
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(lead.createdAt)}
                      </TableCell>

                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-start gap-2">
                          <select
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                            disabled={updating || converted}
                            aria-label={`Status for ${lead.company}`}
                            data-testid="lead-status-select"
                            className={SELECT_CLASS}
                            title={LEAD_STATUS_DESCRIPTIONS[lead.status]}
                          >
                            {LEAD_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {statusLabel(status)}
                              </option>
                            ))}
                          </select>
                          {converted ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              data-testid="lead-already-converted"
                              onClick={() =>
                                navigate({
                                  to: '/platform/organizations/$orgId',
                                  params: { orgId: lead.convertedOrganizationId! },
                                })
                              }
                            >
                              Already Converted
                            </Button>
                          ) : lead.status !== 'CLOSED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid="lead-convert-button"
                              onClick={() => setConvertLead(lead)}
                            >
                              Convert
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
          prevTestId="leads-prev-page"
          nextTestId="leads-next-page"
        />
      )}

      <ConvertLeadWizard
        lead={convertLead}
        open={Boolean(convertLead)}
        onOpenChange={(open) => {
          if (!open) setConvertLead(null);
        }}
      />

      <Dialog
        open={Boolean(detailLeadId)}
        onOpenChange={(open) => {
          if (!open) setDetailLeadId(null);
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
            <DialogTitle>{detailLead?.company ?? 'Lead'}</DialogTitle>
            <DialogDescription>
              Timeline and conversion status for this demo request.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
            {detailLoading && <LoadingState label="Loading lead…" />}
            {detailLead && (
              <>
                <div className="grid gap-3 rounded-lg border border-brand/10 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Contact</p>
                    <p className="font-medium">{detailLead.name}</p>
                    <p className="text-muted-foreground">{detailLead.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1">
                      <StatusBadge status={detailLead.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {LEAD_STATUS_DESCRIPTIONS[detailLead.status]}
                    </p>
                  </div>
                </div>

                {detailLead.convertedOrganizationId ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate({
                          to: '/platform/organizations/$orgId',
                          params: { orgId: detailLead.convertedOrganizationId! },
                        })
                      }
                    >
                      Open organization
                    </Button>
                    {detailLead.convertedInvitationId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resending}
                        className="gap-1.5"
                        onClick={() => {
                          void (async () => {
                            try {
                              const result = await resendInvite(detailLead.id);
                              if (result.invitation.emailSent) {
                                toast.success('Invitation resent');
                              } else {
                                toast.warning('Invitation created but email could not be sent.');
                                if (result.invitation.acceptUrl) {
                                  await navigator.clipboard.writeText(result.invitation.acceptUrl);
                                  toast.message('Invitation link copied');
                                }
                              }
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Resend failed');
                            }
                          })();
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Resend invitation
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConvertLead(detailLead)}>
                    Convert to organization
                  </Button>
                )}

                <section>
                  <h3 className="mb-3 font-display text-base font-semibold">Timeline</h3>
                  <LeadTimeline events={detailLead.timelineEvents ?? []} />
                </section>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
