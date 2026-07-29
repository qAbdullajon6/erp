'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useOrderNotes,
  useCreateOrderNote,
  useUpdateOrderNote,
  useDeleteOrderNote,
} from '@/lib/api/orders';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { Loader2, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface OrderNotesPanelProps {
  orderId: string;
  canWrite: boolean;
}

export function OrderNotesPanel({ orderId, canWrite }: OrderNotesPanelProps) {
  const { data: notes, loading } = useOrderNotes(orderId);
  const { create, loading: creating } = useCreateOrderNote(orderId);
  const { update, loading: updating } = useUpdateOrderNote(orderId);
  const { remove, loading: deleting } = useDeleteOrderNote(orderId);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await create(trimmed);
      setBody('');
      toast.success('Note added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add note');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3.5 w-3.5" />
        Internal notes
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No internal notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
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
                          toast.error(err instanceof Error ? err.message : 'Failed to update');
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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {note.author
                        ? `${note.author.firstName} ${note.author.lastName}`
                        : 'Team'}{' '}
                      ·{' '}
                      <span title={formatDateTime(note.createdAt)}>
                        {formatRelativeTime(note.createdAt)}
                      </span>
                      {note.updatedAt && note.createdAt && note.updatedAt !== note.createdAt
                        ? ' · edited'
                        : ''}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingId(note.id);
                          setEditBody(note.body);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deleting}
                        onClick={async () => {
                          try {
                            await remove(note.id);
                            toast.success('Note removed');
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed');
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an internal note for your team…"
            rows={3}
            maxLength={4000}
          />
          <Button size="sm" disabled={creating || !body.trim()} onClick={handleSubmit}>
            {creating ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      )}
    </div>
  );
}
