'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useOrderNotes,
  useCreateOrderNote,
  useUpdateOrderNote,
  useDeleteOrderNote,
} from '@/lib/api/orders';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { Pencil, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';
import { cn } from '@/lib/utils';

interface OrderNotesPanelProps {
  orderId: string;
  canWrite: boolean;
}

function AuthorAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
      {initials || '?'}
    </span>
  );
}

export function OrderNotesPanel({ orderId, canWrite }: OrderNotesPanelProps) {
  const { data: notes, loading, error, refetch } = useOrderNotes(orderId);
  const { create, loading: creating } = useCreateOrderNote(orderId);
  const { update, loading: updating } = useUpdateOrderNote(orderId);
  const { remove, loading: deleting } = useDeleteOrderNote(orderId);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [pendingBody, setPendingBody] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setPendingBody(trimmed);
    setBody('');
    try {
      await create(trimmed);
      toast.success('Note added');
    } catch (err) {
      toast.error(describeError(err, 'Failed to add note'));
      setBody(trimmed);
    } finally {
      setPendingBody(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3.5 w-3.5" />
        Internal notes
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : notes.length === 0 && !pendingBody ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 py-6 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
          </span>
          <p className="text-sm text-muted-foreground">No internal notes yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {pendingBody && (
            <li className="rounded-lg border border-dashed border-border/70 bg-background/20 px-3 py-2.5 opacity-60">
              <p className="whitespace-pre-wrap text-sm text-foreground">{pendingBody}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Posting…</p>
            </li>
          )}
          {notes.map((note) => {
            const authorName = note.author
              ? `${note.author.firstName} ${note.author.lastName}`
              : 'Team';
            return (
              <li
                key={note.id}
                className="rounded-lg border border-border/70 bg-background/30 px-3 py-2.5"
              >
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={updating || !editBody.trim()}
                        onClick={async () => {
                          try {
                            await update(note.id, editBody.trim());
                            setEditingId(null);
                            toast.success('Note updated');
                          } catch (err) {
                            toast.error(describeError(err, 'Failed to update'));
                          }
                        }}
                      >
                        {updating ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <AuthorAvatar name={authorName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">{authorName}</span>
                        <span
                          className="shrink-0 text-[11px] text-muted-foreground"
                          title={formatDateTime(note.createdAt)}
                        >
                          {formatRelativeTime(note.createdAt)}
                          {note.updatedAt && note.createdAt && note.updatedAt !== note.createdAt
                            ? ' · edited'
                            : ''}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                    </div>
                    {canWrite && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="Edit note"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditBody(note.body);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Delete note"
                          disabled={deleting}
                          onClick={async () => {
                            try {
                              await remove(note.id);
                              toast.success('Note removed');
                            } catch (err) {
                              toast.error(describeError(err, 'Failed'));
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <div className={cn('rounded-lg border border-border/60 bg-background/20 p-3 space-y-2', notes.length > 0 || pendingBody ? 'mt-1' : '')}>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an internal note for your team…"
            rows={2}
            maxLength={4000}
            className="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleSubmit();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Ctrl+Enter to submit</span>
            <Button size="sm" disabled={creating || !body.trim()} onClick={handleSubmit}>
              {creating ? 'Saving…' : 'Add note'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
