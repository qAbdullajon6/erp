'use client';

import { useState } from 'react';
import {
  Archive,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAiConversations, useConversationActions, useCreateConversation } from '@/hooks/use-ai';
import type { AiConversation } from '@/lib/api/ai';

interface ConversationSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationSidebar({ activeId, onSelect, onNew }: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const { data, isPending } = useAiConversations({ search: search || undefined, limit: 50 });
  const conversations = data?.items ?? [];

  const pinned = conversations.filter((c) => c.pinned);
  const recent = conversations.filter((c) => !c.pinned);

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 p-3">
        <Button variant="default" size="sm" className="flex-1 gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 py-1">
          {isPending && (
            <div className="space-y-2 px-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
              ))}
            </div>
          )}

          {pinned.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Pinned</p>
              {pinned.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}

          {recent.length > 0 && (
            <div>
              {pinned.length > 0 && (
                <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Recent</p>
              )}
              {recent.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}

          {!isPending && conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {search ? 'No conversations match.' : 'No conversations yet.'}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConversationItem({
  conversation,
  active,
  onSelect,
}: {
  conversation: AiConversation;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const actions = useConversationActions();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);

  const commitRename = () => {
    setRenaming(false);
    if (title.trim() && title !== conversation.title) {
      actions.rename.mutate({ id: conversation.id, title: title.trim() });
    } else {
      setTitle(conversation.title);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
        'cursor-pointer hover:bg-surface/60',
        active && 'bg-surface text-foreground',
        !active && 'text-muted-foreground',
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />

      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setTitle(conversation.title);
              setRenaming(false);
            }
          }}
          className="min-w-0 flex-1 border-none bg-transparent text-xs text-foreground outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs">{conversation.title}</span>
      )}

      {conversation.pinned && <Pin className="h-3 w-3 shrink-0 text-brand" />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="invisible h-5 w-5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-full w-full" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              actions.pin.mutate({ id: conversation.id, pinned: !conversation.pinned })
            }
          >
            {conversation.pinned ? (
              <>
                <PinOff className="mr-2 h-3.5 w-3.5" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="mr-2 h-3.5 w-3.5" />
                Pin
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              actions.archive.mutate({
                id: conversation.id,
                status: conversation.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED',
              })
            }
          >
            <Archive className="mr-2 h-3.5 w-3.5" />
            {conversation.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => actions.remove.mutate(conversation.id)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
