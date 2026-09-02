'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertCircle, Inbox, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import {
  usePlatformSupportTicketsQuery,
  type SupportTicketStatus,
  type PlatformSupportTicket,
} from '@/lib/api/platform';
import { describeError } from '@/lib/api/describe-error';
import { cn } from '@/lib/utils';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { value: SupportTicketStatus | ''; label: string; Icon: React.ElementType }[] = [
  { value: '',       label: 'All',       Icon: Inbox },
  { value: 'OPEN',   label: 'Questions', Icon: AlertCircle },
  { value: 'CLOSED', label: 'Closed',    Icon: XCircle },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: SupportTicketStatus) {
  if (status === 'OPEN' || status === 'IN_PROGRESS') {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-400/40 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        Question
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Closed
    </span>
  );
}

function lastMessageTime(ticket: PlatformSupportTicket): string {
  const lastMsg = ticket.messages?.[0];
  const iso = lastMsg?.createdAt ?? ticket.updatedAt;
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  const isThisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

function creatorName(ticket: PlatformSupportTicket): string {
  if (!ticket.createdBy) return '—';
  return `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function TicketRow({ ticket }: { ticket: PlatformSupportTicket }) {
  const isOpen = ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS';
  return (
    <Link
      to="/platform/support/$ticketId"
      params={{ ticketId: ticket.id }}
      className={cn(
        'grid grid-cols-[2fr_2fr_2fr_auto_auto] items-center gap-4 border-b border-border px-4 py-3 transition-colors hover:bg-muted/40',
        isOpen ? 'border-l-2 border-l-blue-500 bg-blue-500/[0.02]' : 'border-l-2 border-l-transparent',
      )}
    >
      {/* Full name */}
      <span className={cn('truncate text-sm font-medium', !isOpen && 'text-muted-foreground')}>
        {creatorName(ticket)}
      </span>

      {/* Email */}
      <span className="truncate text-sm text-muted-foreground">
        {ticket.createdBy?.email ?? '—'}
      </span>

      {/* Organization */}
      <span className="truncate text-sm text-muted-foreground">
        {ticket.organization?.name ?? '—'}
      </span>

      {/* Status */}
      <span>{statusBadge(ticket.status)}</span>

      {/* Last message time */}
      <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
        {lastMessageTime(ticket)}
      </span>
    </Link>
  );
}

// ─── Column header ────────────────────────────────────────────────────────────

function ColHeader() {
  return (
    <div className="grid grid-cols-[2fr_2fr_2fr_auto_auto] gap-4 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <span>Name</span>
      <span>Email</span>
      <span>Organization</span>
      <span>Status</span>
      <span className="text-right">Last message</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SupportList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus | ''>('');

  const isAll = status === '';

  const { data, isLoading, isError, error, refetch } = usePlatformSupportTicketsQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  // For "All" tab: split into two groups
  const questions = items.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
  const closed = items.filter((t) => t.status === 'CLOSED' || t.status === 'RESOLVED');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle={
          isLoading ? 'Loading…' : isError ? 'Error' : `${meta?.total ?? 0} tickets`
        }
      />

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder="Search by name, email, subject…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-9"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {TABS.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => { setStatus(value); setPage(1); }}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              status === value
                ? 'border-brand text-brand'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn(
              'h-3.5 w-3.5',
              value === 'OPEN'   && 'text-blue-500',
              value === 'CLOSED' && 'text-muted-foreground/60',
              value === ''       && 'text-muted-foreground',
            )} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && <LoadingState label="Loading tickets…" />}
      {isError && !isLoading && (
        <ErrorState message={describeError(error, 'Failed to load tickets')} onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && isAll && (
        <>
          {items.length === 0 && (
            <EmptyState title="No tickets" description="No support tickets yet." />
          )}
          {items.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <ColHeader />
              {questions.map((t) => <TicketRow key={t.id} ticket={t} />)}
              {closed.map((t) => <TicketRow key={t.id} ticket={t} />)}
            </div>
          )}
          {meta && meta.totalPages > 1 && (
            <PaginationBar
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {!isLoading && !isError && !isAll && (
        <>
          {items.length === 0 ? (
            <EmptyState title="No tickets" description="No tickets match this filter." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <ColHeader />
              {items.map((t) => <TicketRow key={t.id} ticket={t} />)}
            </div>
          )}
          {meta && meta.totalPages > 1 && (
            <PaginationBar
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
