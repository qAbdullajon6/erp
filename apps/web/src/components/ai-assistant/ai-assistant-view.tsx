'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ArrowDown, Eye, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/api/describe-error';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import {
  useAiCapabilities,
  useAiConversation,
  useChatStream,
  useCreateConversation,
} from '@/hooks/use-ai';
import { aiAPI } from '@/lib/api/ai';
import { ConversationSidebar } from './conversation-sidebar';
import { ChatInput } from './chat-input';
import { ChatMessage } from './chat-message';
import { ConfirmationBanner } from './confirmation-banner';
import { ErrorBanner } from './error-banner';
import { ExecutionTracePanel } from './execution-trace';
import { MessageSkeleton } from './message-skeleton';
import { StreamingIndicator } from './streaming-indicator';
import { WelcomeScreen } from './welcome-screen';
import { MarkdownMessage } from './markdown-message';

export function AiAssistantView() {
  const { conversationId } = useSearch({ from: '/app/ai-assistant' });
  const navigate = useNavigate({ from: '/app/ai-assistant' });
  const activeConversationId = conversationId ?? null;
  const setActiveConversationId = useCallback(
    (id: string | null) => {
      void navigate({ search: (prev) => ({ ...prev, conversationId: id ?? undefined }) });
    },
    [navigate],
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [readOnlyMode, setReadOnlyMode] = useState(false);

  const { data: capabilities, isPending: loadingCapabilities } = useAiCapabilities();
  const { data: conversation, isPending: conversationLoading } = useAiConversation(activeConversationId);
  const createConversation = useCreateConversation();
  const { send, stop, streaming, turn, error } = useChatStream(activeConversationId);

  // Fallback labels for the confirmation card, for any mutating tool that
  // doesn't have a curated summary in confirmation-format.ts.
  const toolDescriptions = useMemo(
    () => Object.fromEntries((capabilities?.tools ?? []).map((t) => [t.name, t.description])),
    [capabilities?.tools],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  // Whether the viewport is close enough to the bottom that new content
  // should pull it along. A user who has scrolled up to reread something
  // must never be yanked back down by the next streamed token.
  const stickToBottomRef = useRef(true);
  const prevStreamingRef = useRef(streaming);
  // Mirrors stickToBottomRef into render-visible state, so the floating
  // "scroll to latest" pill can appear/disappear as the user scrolls.
  const [showScrollButton, setShowScrollButton] = useState(false);
  // There is no backend support for editing history in place — see
  // handleEditSubmit. Hiding the superseded turn client-side is the honest
  // approximation: it reappears on refresh since nothing was deleted.
  const [hiddenMessageIds, setHiddenMessageIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (capabilities?.defaultModel && !selectedModel) {
      setSelectedModel(capabilities.defaultModel);
    }
  }, [capabilities?.defaultModel, selectedModel]);

  // A conversation switch must not carry over another thread's edit-hides or
  // scroll-button state.
  useEffect(() => {
    setHiddenMessageIds(new Set());
    setShowScrollButton(false);
    stickToBottomRef.current = true;
  }, [activeConversationId]);

  const handleViewportScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 96;
    stickToBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  }, []);

  const scrollToLatest = useCallback(() => {
    stickToBottomRef.current = true;
    setShowScrollButton(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  // Follows new content only while already stuck to the bottom.
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation?.messages, turn.text, turn.tools]);

  // The assistant finishing a turn always snaps back to the bottom, even if
  // the user drifted up mid-stream — matching the explicit "assistant
  // finishes response" auto-scroll trigger.
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      stickToBottomRef.current = true;
      setShowScrollButton(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  const handleNew = useCallback(async () => {
    try {
      const conv = await createConversation.mutateAsync({
        model: selectedModel || undefined,
        readOnly: readOnlyMode || undefined,
      });
      setActiveConversationId(conv.id);
    } catch (err) {
      toast.error(describeError(err, 'Failed to start a conversation'));
    }
  }, [createConversation, selectedModel, readOnlyMode]);

  const handleSend = useCallback(
    async (message: string) => {
      // Sending a message is one of the two explicit auto-scroll triggers —
      // jump back down even if the user had scrolled up to reread history.
      stickToBottomRef.current = true;
      setShowScrollButton(false);
      if (!activeConversationId) {
        try {
          const conv = await createConversation.mutateAsync({
            model: selectedModel || undefined,
            readOnly: readOnlyMode || undefined,
          });
          setActiveConversationId(conv.id);
          void send(message, conv.id);
        } catch (err) {
          toast.error(describeError(err, 'Failed to start a conversation'));
        }
        return;
      }
      send(message);
    },
    [activeConversationId, createConversation, selectedModel, readOnlyMode, send],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      void handleSend(text);
    },
    [handleSend],
  );

  const handleRetry = useCallback(() => {
    if (!conversation?.messages) return;
    const lastUser = [...conversation.messages].reverse().find((m) => m.role === 'USER');
    if (lastUser?.content) send(lastUser.content);
  }, [conversation?.messages, send]);

  const messages = conversation?.messages ?? [];
  const visibleMessages = hiddenMessageIds.size > 0
    ? messages.filter((m) => !hiddenMessageIds.has(m.id))
    : messages;
  const lastUserMessageId = [...visibleMessages].reverse().find((m) => m.role === 'USER')?.id ?? null;

  // There is no backend endpoint to delete or amend a persisted message, and
  // this task explicitly rules out backend changes — so "replace" is done by
  // hiding the edited turn (the user message plus everything after it, i.e.
  // its assistant response) from THIS client's view and sending the edited
  // text as a normal new turn appended after it. The hidden turn is not
  // deleted: a refresh will show the full, honest history again.
  const handleEditSubmit = useCallback(
    (newContent: string) => {
      const idx = visibleMessages.findIndex((m) => m.id === lastUserMessageId);
      if (idx !== -1) {
        setHiddenMessageIds((prev) => {
          const next = new Set(prev);
          for (const m of visibleMessages.slice(idx)) next.add(m.id);
          return next;
        });
      }
      stickToBottomRef.current = true;
      setShowScrollButton(false);
      send(newContent);
    },
    [visibleMessages, lastUserMessageId, send],
  );

  // Switching to a conversation that already has history briefly has no data
  // for its new query key. `streaming` is excluded here because sending the
  // very first message of a brand-new conversation hits this same instant —
  // there messages are genuinely empty and the live turn (not this query) is
  // what should render, so the skeleton must not cover it.
  const isSwitchingConversation = !!activeConversationId && conversationLoading && !streaming;

  // A turn that fails before anything is persisted — e.g. the usage-credit
  // limit, which is enforced before the user's own message is saved — leaves
  // `messages` empty. Without `!error` here, the welcome screen would cover
  // the error banner and the failure would be completely invisible: the
  // message just vanishes with no indication anything went wrong.
  const showWelcome =
    !isSwitchingConversation &&
    (!activeConversationId || (visibleMessages.length === 0 && !streaming && !error));

  return (
    // The AppShell wraps every page in px-4 py-6 (sm:px-8 sm:py-8) padding on
    // top of a fixed h-16 topbar. Sizing this box to only `100vh - 4rem`
    // ignores that padding, so the page overflows by exactly that amount and
    // the whole browser window scrolls — the one thing a ChatGPT-style layout
    // must never do. Subtracting the padding here keeps the box's bottom edge
    // flush with the viewport instead.
    <div className="flex h-[calc(100vh-4rem-3rem)] overflow-hidden rounded-xl border border-border/60 sm:h-[calc(100vh-4rem-4rem)]">
      {/* Sidebar */}
      <div
        className={cn(
          'shrink-0 transition-all duration-200',
          sidebarOpen ? 'w-64' : 'w-0',
        )}
      >
        {sidebarOpen && (
          <ConversationSidebar
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
            onNew={handleNew}
          />
        )}
      </div>

      {/* Main chat area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          <div className="min-w-0 flex-1">
            {/* The conversation is what this screen is, so its name is the
                page heading — every other screen gives a screen reader an h1
                to land on and this one gave it nothing. */}
            <h1 className="truncate text-sm font-medium text-foreground">
              {conversation?.title ?? 'New Conversation'}
            </h1>
            {conversation && (
              <p className="truncate text-xs text-muted-foreground" title={formatDateTime(conversation.lastMessageAt)}>
                Last active {formatRelativeTime(conversation.lastMessageAt)}
              </p>
            )}
          </div>

          {/* Below `sm`, the header only has room for the back-and-title —
              these are all secondary status, not controls needed to use the
              page, so they hide rather than clip or force the row to wrap. */}
          {conversation?.readOnly && (
            <span className="hidden shrink-0 items-center gap-1 rounded-md border border-brand/20 bg-brand/5 px-2 py-0.5 text-xs text-brand sm:flex">
              <Eye className="h-3 w-3" />
              Read-only
            </span>
          )}

          {!activeConversationId && (
            <label className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
              <Switch
                checked={readOnlyMode}
                onCheckedChange={setReadOnlyMode}
                className="h-4 w-7"
              />
              Observe only
            </label>
          )}

          {conversation && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {(conversation.totalTokens ?? 0).toLocaleString()} tokens
            </span>
          )}
        </div>

        {/* Messages area — min-h-0 lets this flex child shrink below its
            content height, which is what lets the ScrollArea inside it
            actually scroll instead of pushing the whole page taller. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {isSwitchingConversation ? (
            <MessageSkeleton />
          ) : showWelcome ? (
            <WelcomeScreen
              suggestions={capabilities?.suggestions ?? []}
              onSuggestion={handleSuggestion}
              available={capabilities?.available ?? false}
              configured={capabilities?.configured ?? false}
            />
          ) : (
            <ScrollArea className="h-full" onViewportScroll={handleViewportScroll}>
              <div
                key={activeConversationId ?? 'new'}
                className="mx-auto max-w-3xl pb-4 animate-in fade-in duration-200"
              >
                {visibleMessages.map((msg, i) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLast={i === visibleMessages.length - 1}
                    onRetry={i === visibleMessages.length - 1 ? handleRetry : undefined}
                    editable={!streaming && msg.role === 'USER' && msg.id === lastUserMessageId}
                    onEditSubmit={handleEditSubmit}
                  />
                ))}

                {/* Live streaming turn */}
                {streaming && (
                  <div className="bg-surface/40">
                    <StreamingIndicator turn={turn} />
                    {turn.text && (
                      <div className="px-4 pb-4 pl-12">
                        <MarkdownMessage content={turn.text} />
                      </div>
                    )}
                  </div>
                )}

                {/* Confirmation request from the AI */}
                {turn.confirmationRequired && (
                  <ConfirmationBanner
                    action={turn.confirmationRequired.action}
                    details={turn.confirmationRequired.details}
                    toolDescriptions={toolDescriptions}
                    onConfirm={async () => {
                      if (!activeConversationId) return;
                      try {
                        // Awaited, not fire-and-forget: the follow-up chat
                        // request reads this decision server-side, so it must
                        // not be able to race ahead of the record of it.
                        await aiAPI.confirm(activeConversationId, true);
                        send('Yes, proceed.');
                      } catch (err) {
                        toast.error(describeError(err, 'Failed to confirm action'));
                      }
                    }}
                    onDeny={async () => {
                      if (!activeConversationId) return;
                      try {
                        await aiAPI.confirm(activeConversationId, false);
                        send('No, cancel that.');
                      } catch (err) {
                        toast.error(describeError(err, 'Failed to confirm action'));
                      }
                    }}
                  />
                )}

                {/* Execution trace (shown after turn completes) */}
                {turn.trace && <ExecutionTracePanel trace={turn.trace} />}

                {error && <ErrorBanner message={error} onRetry={lastUserMessageId ? handleRetry : undefined} />}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>
          )}

          {!showWelcome && showScrollButton && (
            <button
              type="button"
              onClick={scrollToLatest}
              aria-label="Scroll to latest message"
              className={cn(
                'absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full',
                'border border-border/60 bg-surface px-3 py-1.5 text-xs text-foreground shadow-md',
                'transition-all hover:-translate-y-0.5 hover:shadow-lg',
                'animate-in fade-in slide-in-from-bottom-1 duration-200',
              )}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Scroll to latest
            </button>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onStop={stop}
          streaming={streaming}
          disabled={!capabilities?.available || loadingCapabilities}
          models={capabilities?.models ?? []}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  );
}
