'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  usePlatformSupportTicketQuery,
  useUpdateSupportTicketMutation,
  useAddStaffMessageMutation,
  useRequestConfirmationMutation,
  useUploadStaffAttachmentMutation,
  type SupportTicketStatus,
  type SupportTicketMessage,
} from '@/lib/api/platform';
import { formatDate } from '@/lib/format';
import { describeError } from '@/lib/api/describe-error';
import { cn } from '@/lib/utils';
import { useAttachmentUrl } from '@/lib/api/use-attachment-url';

// ─── Attachment helpers ───────────────────────────────────────────────────────

interface Attachment { url: string; name: string; mime: string; }

function parseBody(body: string): { text: string; attachments: Attachment[] } {
  const regex = /\[ATTACH:(\{[^}]+\})\]/g;
  const attachments: Attachment[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    try { attachments.push(JSON.parse(m[1]) as Attachment); } catch { /* ignore */ }
  }
  return { text: body.replace(/\n?\[ATTACH:\{[^}]+\}\]/g, '').trim(), attachments };
}

function isImage(mime: string) { return mime.startsWith('image/'); }

function AttachmentImage({ att }: { att: Attachment }) {
  const blobUrl = useAttachmentUrl(att.url);
  if (!blobUrl) return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs opacity-60">
      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      <span className="truncate">{att.name}</span>
    </div>
  );
  return (
    <a href={blobUrl} target="_blank" rel="noreferrer" download={att.name}>
      <img src={blobUrl} alt={att.name} className="max-h-52 max-w-full rounded-lg object-contain" />
    </a>
  );
}

function AttachmentFile({ att }: { att: Attachment }) {
  const blobUrl = useAttachmentUrl(att.url);
  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = att.name;
    a.click();
  };
  return (
    <button
      onClick={handleDownload}
      disabled={!blobUrl}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted',
        !blobUrl && 'cursor-wait opacity-50',
      )}
    >
      {blobUrl ? <Paperclip className="h-3 w-3 shrink-0" /> : <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      <span className="truncate">{att.name}</span>
    </button>
  );
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: SupportTicketStatus; label: string; className: string }[] = [
  { value: 'OPEN',   label: 'Question', className: 'text-blue-600 dark:text-blue-400' },
  { value: 'CLOSED', label: 'Closed',   className: 'text-muted-foreground' },
];

function statusLabel(status: SupportTicketStatus) {
  if (status === 'IN_PROGRESS') return 'Question';
  if (status === 'RESOLVED') return 'Closed';
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}
function statusClass(status: SupportTicketStatus) {
  if (status === 'IN_PROGRESS') return 'text-blue-600 dark:text-blue-400';
  if (status === 'RESOLVED') return 'text-muted-foreground';
  return STATUS_OPTIONS.find((s) => s.value === status)?.className ?? '';
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return formatDate(iso);
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: SupportTicketMessage }) {
  const isStaff = msg.isStaff;
  const authorName = msg.author
    ? `${msg.author.firstName} ${msg.author.lastName}`
    : isStaff ? 'FlowERP Support' : 'Customer';
  const avatarLabel = msg.author
    ? `${msg.author.firstName[0] ?? ''}${msg.author.lastName[0] ?? ''}`.toUpperCase()
    : isStaff ? 'FL' : '?';

  const { text, attachments } = parseBody(msg.body);

  return (
    <div className={cn('flex gap-2.5', isStaff ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          isStaff ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground',
        )}
        title={authorName}
      >
        {avatarLabel}
      </div>

      {/* Content */}
      <div className={cn('flex max-w-[75%] flex-col gap-0.5', isStaff && 'items-end')}>
        <span className={cn('px-1 text-[10px] font-medium', isStaff ? 'text-brand' : 'text-muted-foreground')}>
          {isStaff ? 'FlowERP Support' : authorName}
        </span>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isStaff
              ? 'rounded-tr-sm bg-brand/10 text-foreground'
              : 'rounded-tl-sm bg-muted text-foreground',
            attachments.length > 0 && !text && 'p-1.5',
          )}
        >
          {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
          {attachments.length > 0 && (
            <div className={cn('flex flex-col gap-1.5', text && 'mt-2')}>
              {attachments.map((att, i) =>
                isImage(att.mime)
                  ? <AttachmentImage key={i} att={att} />
                  : <AttachmentFile key={i} att={att} />,
              )}
            </div>
          )}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">
          {formatRelative(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SupportTicketDetail({ ticketId }: { ticketId: string }) {
  const { data, isLoading, isError, error, refetch } = usePlatformSupportTicketQuery(ticketId);
  const { mutate: updateTicket, isPending: updating } = useUpdateSupportTicketMutation();
  const { mutate: sendReply, isPending: sending } = useAddStaffMessageMutation(ticketId);
  const { mutate: requestConfirmation, isPending: requesting } = useRequestConfirmationMutation();
  const { mutateAsync: uploadFile } = useUploadStaffAttachmentMutation(ticketId);

  const [replyBody, setReplyBody] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = data?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-6 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex-1 px-6 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className={cn('h-14 rounded-2xl', i % 2 === 0 ? 'w-3/5' : 'ml-auto w-3/5')} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {describeError(error, 'Failed to load ticket')}
        </p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-brand hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const isClosed = data.status === 'CLOSED' || data.status === 'RESOLVED';
  const confirmationPending = !!data.resolutionRequestedAt && !isClosed;
  const isPending = sending || uploading;

  const handleSendReply = async () => {
    const text = replyBody.trim();
    if (!text && attachedFiles.length === 0) return;

    let attachParts = '';
    if (attachedFiles.length > 0) {
      setUploading(true);
      try {
        const results = await Promise.all(attachedFiles.map((f) => uploadFile(f)));
        attachParts = results
          .map((r) => `\n[ATTACH:${JSON.stringify({ url: r.url, name: r.name, mime: r.mime })}]`)
          .join('');
      } catch (err) {
        toast.error(describeError(err, 'File upload failed'));
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    const body = (text + attachParts).trim();
    if (!body) return;

    sendReply(body, {
      onSuccess: () => {
        setReplyBody('');
        setAttachedFiles([]);
        toast.success('Reply sent');
        textareaRef.current?.focus();
      },
      onError: (err) => toast.error(describeError(err, 'Failed to send reply')),
    });
  };

  const handleRequestConfirmation = () => {
    requestConfirmation(ticketId, {
      onSuccess: () => toast.success('Confirmation request sent'),
      onError: (err) => toast.error(describeError(err, 'Request failed')),
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar ── */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <Link
          to="/platform/support"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="h-3 w-3" />
          Support
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">{data.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {data.organization && (
                <Link
                  to="/platform/organizations/$orgId"
                  params={{ orgId: data.organization.id }}
                  className="font-medium hover:text-brand"
                >
                  {data.organization.name}
                </Link>
              )}
              {data.organization && <span>·</span>}
              <span>
                {data.createdBy
                  ? `${data.createdBy.firstName} ${data.createdBy.lastName}`
                  : 'Unknown'}
              </span>
              <span>·</span>
              <span>{formatDate(data.createdAt)}</span>
            </div>
          </div>

          {/* Status dropdown */}
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50',
                    statusClass(data.status),
                  )}
                  disabled={updating}
                >
                  {statusLabel(data.status)}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_OPTIONS.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    className={s.className}
                    onClick={() =>
                      updateTicket(
                        { id: ticketId, input: { status: s.value } },
                        { onError: (err) => toast.error(describeError(err, 'Update failed')) },
                      )
                    }
                  >
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Chat messages ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No messages yet.
            </p>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>


      {/* ── Reply area ── */}
      <div className="shrink-0 border-t border-border bg-background px-6 py-4">
        {isClosed ? (
          <p className="text-center text-xs text-muted-foreground">
            This ticket is closed. Change the status above to reopen.
          </p>
        ) : (
          <div className="space-y-3">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="max-w-[120px] truncate">{f.name}</span>
                    <button
                      className="ml-0.5 hover:text-destructive"
                      onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              ref={textareaRef}
              placeholder="Write a reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              className="resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSendReply();
              }}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <span className="text-[11px] text-muted-foreground">
                  ⌘Enter · visible as <strong>FlowERP Support</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleRequestConfirmation}
                  disabled={requesting || confirmationPending}
                >
                  {requesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {confirmationPending ? 'Request sent' : 'Did this solve it?'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSendReply()}
                  disabled={isPending || (!replyBody.trim() && attachedFiles.length === 0)}
                  className="h-8 gap-1.5"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xlsx,.txt"
        onChange={(e) => {
          setAttachedFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
