'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearch } from '@tanstack/react-router';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useSupportTickets,
  useSupportTicket,
  useCreateTicketMutation,
  useAddMessageMutation,
  useConfirmResolutionMutation,
  useDeclineResolutionMutation,
  useUploadAttachmentMutation,
  useSupportUnreadCount,
  useMarkTicketReadMutation,
  formatRelativeTime,
  getInitials,
  ticketStatusVariant,
  TICKET_STATUS_LABEL,
  type TicketMessage,
} from '@/lib/api/support';
import { useSupportStream } from '@/lib/api/support-stream';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/api/describe-error';
import { useAttachmentUrl } from '@/lib/api/use-attachment-url';

// ─── Support button (entry point) ─────────────────────────────────────────────

export function SupportButton() {
  const [open, setOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const { data: currentUser } = useCurrentUser();
  const visible = !!currentUser && !['DRIVER'].includes(currentUser.membership.role);
  const { data: unreadData } = useSupportUnreadCount(visible);
  const unreadCount = unreadData?.unreadCount ?? 0;

  useSupportStream({ enabled: visible, openTicketId });

  let searchParams: Record<string, string> = {};
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    searchParams = useSearch({ strict: false }) as Record<string, string>;
  } catch {
    // Not in a route context — ignore
  }

  useEffect(() => {
    const ticketId = searchParams.openSupportTicket;
    if (ticketId && typeof ticketId === 'string') {
      setOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('openSupportTicket');
      window.history.replaceState(null, '', url.toString());
    }
  }, [searchParams.openSupportTicket]);

  if (!visible) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setOpenTicketId(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
          aria-label={unreadCount > 0 ? `Support, ${unreadCount} ta o'qilmagan` : 'Support'}
        >
          <HelpCircle className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-24px)] max-w-[380px] p-0 shadow-2xl"
        style={{ height: '520px' }}
      >
        <SupportChatPanel
          onClose={() => setOpen(false)}
          onTicketChange={setOpenTicketId}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Main chat panel ──────────────────────────────────────────────────────────

function SupportChatPanel({
  onClose,
  onTicketChange,
}: {
  onClose: () => void;
  onTicketChange: (id: string | null) => void;
}) {
  const { data: currentUser } = useCurrentUser();
  const { data: ticketList, isLoading: listLoading } = useSupportTickets();
  const tickets = ticketList?.items ?? [];
  /// One chat = one ticket, and the chat must NOT restart after it closes.
  /// The list arrives newest-updated-first, so the conversation keeps its
  /// history here regardless of status; a fresh ticket is created only when
  /// the tenant has never written before.
  const activeTicket = tickets[0] ?? null;

  const { data: fullTicket, isLoading: ticketLoading } = useSupportTicket(
    activeTicket?.id ?? null,
  );
  const { mutate: markRead } = useMarkTicketReadMutation();

  useEffect(() => {
    onTicketChange(activeTicket?.id ?? null);
  }, [activeTicket?.id, onTicketChange]);

  // Mark ticket as read when opened or when messages change
  useEffect(() => {
    if (fullTicket) markRead(fullTicket.id);
  }, [fullTicket, markRead]);

  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dismissedConfirmation, setDismissedConfirmation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [uploading, setUploading] = useState(false);
  const { mutateAsync: uploadFile } = useUploadAttachmentMutation(activeTicket?.id ?? '');
  const { mutate: createTicket, isPending: creating } = useCreateTicketMutation();
  const { mutate: addMessage, isPending: sending } = useAddMessageMutation(
    activeTicket?.id ?? '',
  );
  const { mutate: confirmResolution, isPending: confirming } =
    useConfirmResolutionMutation();
  const { mutate: declineResolution, isPending: declining } = useDeclineResolutionMutation();

  const messages: TicketMessage[] = fullTicket?.messages ?? [];

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const confirmationRequested = !!fullTicket?.resolutionRequestedAt;

  useEffect(() => {
    if (confirmationRequested) setDismissedConfirmation(false);
  }, [confirmationRequested]);

  useEffect(() => {
    setDismissedConfirmation(false);
  }, [fullTicket?.id]);

  const showResolution =
    confirmationRequested &&
    (fullTicket?.status === 'OPEN' || fullTicket?.status === 'IN_PROGRESS') &&
    !dismissedConfirmation;

  const isLoading = listLoading || (!!activeTicket && ticketLoading);
  const isPending = creating || sending || uploading;

  const handleSend = async () => {
    const text = message.trim();
    if (!text && attachedFiles.length === 0) return;

    // Upload files first (only possible if we already have a ticket).
    // For new conversations, we create the ticket with just the text and
    // attach files in a follow-up message automatically.
    let attachParts = '';
    if (attachedFiles.length > 0 && activeTicket) {
      setUploading(true);
      try {
        const results = await Promise.all(attachedFiles.map((f) => uploadFile(f)));
        attachParts = results
          .map((r) => `\n[ATTACH:${JSON.stringify({ url: r.url, name: r.name, mime: r.mime })}]`)
          .join('');
      } catch (err) {
        toast.error(describeError(err, 'Fayl yuklanmadi'));
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    const body = (text + attachParts).trim();
    if (!body) return;

    if (activeTicket) {
      addMessage(body, {
        onSuccess: () => {
          setMessage('');
          setAttachedFiles([]);
          textareaRef.current?.focus();
        },
        onError: (err) => toast.error(describeError(err, 'Xabar yuborilmadi')),
      });
    } else {
      const raw = text.slice(0, 80).trim();
      const subject = raw.length >= 3 ? raw : "Support so'rovi";
      createTicket(
        { subject, body: text },
        {
          onSuccess: () => {
            setMessage('');
            setAttachedFiles([]);
            textareaRef.current?.focus();
          },
          onError: (err) => toast.error(describeError(err, "So'rov yuborilmadi")),
        },
      );
    }
  };

  const handleConfirmResolution = () => {
    if (!activeTicket) return;
    confirmResolution(activeTicket.id, {
      onSuccess: () => toast.success("Javob tasdiqlandi — tashakkur!"),
      onError: (err) => toast.error(describeError(err, 'Tasdiqlanmadi')),
    });
  };

  const handleDeclineResolution = () => {
    if (!activeTicket) return;
    declineResolution(activeTicket.id, {
      onSuccess: () => setDismissedConfirmation(true),
      onError: (err) => toast.error(describeError(err, "Amal bajarilmadi")),
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[inherit]">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <MessageSquare className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Support</span>
            {activeTicket && (
              <Badge
                variant={ticketStatusVariant(activeTicket.status)}
                className="h-4 px-1.5 text-[9px]"
              >
                {TICKET_STATUS_LABEL[activeTicket.status]}
              </Badge>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Yopish"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages area ── */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-4/5 rounded-2xl" />
            <Skeleton className="ml-auto h-12 w-4/5 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        ) : !activeTicket && !listLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium">Qanday yordam kerak?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Xabar yozing — jamoamiz tez javob beradi.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isMine={msg.authorId === currentUser?.user?.id}
              />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Resolution confirmation prompt ── */}
      {showResolution && (
        <div className="shrink-0 border-t border-brand/10 bg-brand/5 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-foreground">
            Support muammoni hal qildi deb belgiladi. Siz javobni oldingizmi?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 flex-1 gap-1.5 text-xs"
              onClick={handleConfirmResolution}
              disabled={confirming}
            >
              {confirming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Ha, hal bo&apos;ldi
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={handleDeclineResolution}
              disabled={declining}
            >
              Yo&apos;q, savol bor
            </Button>
          </div>
        </div>
      )}


      {/* ── Input area ── */}
      <div className="shrink-0 border-t border-border bg-background px-3 pb-3 pt-2">
          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-[110px] truncate">{f.name}</span>
                  <button
                    className="ml-0.5 rounded hover:text-destructive"
                    onClick={() =>
                      setAttachedFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label="O'chirish"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder="Xabar yozing…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="min-h-0 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fayl biriktirish"
                aria-label="Fayl biriktirish"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <Button
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleSend}
                disabled={isPending || (!message.trim() && attachedFiles.length === 0)}
                aria-label="Yuborish"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xlsx,.txt"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setAttachedFiles((prev) => [...prev, ...files]);
              e.target.value = '';
            }}
          />
      </div>
    </div>
  );
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

interface Attachment { url: string; name: string; mime: string; }

function parseMessageBody(body: string): { text: string; attachments: Attachment[] } {
  const regex = /\[ATTACH:(\{[^}]+\})\]/g;
  const attachments: Attachment[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    try { attachments.push(JSON.parse(m[1]) as Attachment); } catch { /* ignore */ }
  }
  return { text: body.replace(/\n?\[ATTACH:\{[^}]+\}\]/g, '').trim(), attachments };
}

function isImage(mime: string) { return mime.startsWith('image/'); }

function AttachmentImage({ att, isMine }: { att: Attachment; isMine: boolean }) {
  const blobUrl = useAttachmentUrl(att.url);
  if (!blobUrl) return (
    <div className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs opacity-60',
      isMine ? 'bg-brand/20 text-brand-foreground' : 'bg-muted text-muted-foreground')}>
      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      <span className="truncate">{att.name}</span>
    </div>
  );
  return (
    <a href={blobUrl} target="_blank" rel="noreferrer" download={att.name}>
      <img src={blobUrl} alt={att.name} className="max-h-48 max-w-full rounded-lg object-contain" />
    </a>
  );
}

function AttachmentFile({ att, isMine }: { att: Attachment; isMine: boolean }) {
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
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
        isMine ? 'border-brand-foreground/30 text-brand-foreground hover:opacity-80' : 'border-border text-foreground hover:bg-muted',
        !blobUrl && 'opacity-50 cursor-wait',
      )}
    >
      {blobUrl ? <Paperclip className="h-3 w-3 shrink-0" /> : <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      <span className="truncate">{att.name}</span>
    </button>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({
  msg,
  isMine,
}: {
  msg: TicketMessage;
  isMine: boolean;
}) {
  const initials = msg.author
    ? getInitials(msg.author.firstName, msg.author.lastName)
    : msg.isStaff
    ? 'FL'
    : '?';

  const { text, attachments } = parseMessageBody(msg.body);

  return (
    <div className={cn('flex gap-2', isMine ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          msg.isStaff ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground',
        )}
        title={
          msg.isStaff
            ? 'FlowERP Support'
            : msg.author
            ? `${msg.author.firstName} ${msg.author.lastName}`
            : 'Foydalanuvchi'
        }
      >
        {initials}
      </div>

      {/* Bubble */}
      <div className={cn('flex max-w-[76%] flex-col gap-0.5', isMine && 'items-end')}>
        {!isMine && (
          <span className="px-1 text-[10px] font-medium text-muted-foreground">
            {msg.isStaff ? 'FlowERP Support' : msg.author?.firstName ?? 'Foydalanuvchi'}
          </span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed',
            isMine
              ? 'rounded-tr-sm bg-brand text-brand-foreground'
              : 'rounded-tl-sm bg-muted text-foreground',
            (attachments.length > 0 && !text) && 'p-1.5',
          )}
        >
          {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
          {attachments.length > 0 && (
            <div className={cn('flex flex-col gap-1.5', text && 'mt-2')}>
              {attachments.map((att, i) =>
                isImage(att.mime)
                  ? <AttachmentImage key={i} att={att} isMine={isMine} />
                  : <AttachmentFile key={i} att={att} isMine={isMine} />,
              )}
            </div>
          )}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">
          {formatRelativeTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}
