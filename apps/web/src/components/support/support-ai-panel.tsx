'use client';

/**
 * SupportAiPanel — AI Assistant embedded inside the Support drawer.
 *
 * Reuses ALL existing AI infrastructure:
 *   - useCreateConversation / useChatStream hooks
 *   - ChatMessage, ChatInput, StreamingIndicator components
 *   - aiAPI.streamChat for the SSE stream
 *
 * When a ticketId is provided the server-side GET /support/tickets/:id/ai-context
 * endpoint is called FIRST to build a safe context summary (never raw client data),
 * then that summary is sent as the opening user message so the AI has full context.
 *
 * Security: the context endpoint verifies org ownership on the server.
 * The browser never sends raw ticket data to the AI — only the server-fetched
 * summary string is forwarded.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateConversation, useChatStream, useAiCapabilities, useAiConversation, type StreamingTurn } from '@/hooks/use-ai';
import { ChatMessage } from '@/components/ai-assistant/chat-message';
import { ChatInput } from '@/components/ai-assistant/chat-input';
import { StreamingIndicator } from '@/components/ai-assistant/streaming-indicator';
import { supportAPI } from '@/lib/api/support';
import { describeError } from '@/lib/api/describe-error';

interface SupportAiPanelProps {
  /** When set the AI is opened in the context of a specific support ticket. */
  ticketId?: string | null;
  ticketSubject?: string | null;
  onBack: () => void;
}

export function SupportAiPanel({ ticketId, ticketSubject, onBack }: SupportAiPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');

  const createConversation = useCreateConversation();
  const { send, stop, streaming, turn, error } = useChatStream(conversationId);
  const { data: capabilities } = useAiCapabilities();
  const { data: conversation } = useAiConversation(conversationId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Pick the default model once capabilities load.
  useEffect(() => {
    if (capabilities?.defaultModel && !selectedModel) {
      setSelectedModel(capabilities.defaultModel);
    }
  }, [capabilities?.defaultModel, selectedModel]);

  // Auto-scroll to bottom when new content arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turn.text, conversation?.messages?.length]);

  // Initialize once: create the conversation and optionally seed ticket context.
  useEffect(() => {
    if (initialized.current || !capabilities || !selectedModel) return;
    initialized.current = true;

    const init = async () => {
      setInitializing(true);
      try {
        // Create conversation — title describes what it's about.
        const title = ticketSubject
          ? `Support: ${ticketSubject}`
          : 'FlowERP Support';

        const conv = await createConversation.mutateAsync({
          title,
          model: selectedModel,
          readOnly: false,
        });
        setConversationId(conv.id);

        if (ticketId) {
          // Fetch server-verified context summary, then send it as the first message.
          // This is the ONLY safe path — raw ticket data never leaves the server.
          const { context } = await supportAPI.getAiContext(ticketId);
          // Send immediately using the override ID (before re-render picks up conversationId).
          await send(
            `I have a question about my support ticket.\n\n${context}\n\nPlease review my support ticket and let me know if you can help or if I should wait for FlowERP Support to reply.`,
            conv.id,
          );
        }
      } catch (err) {
        toast.error(describeError(err, 'Failed to start AI assistant'));
        initialized.current = false; // allow retry
      } finally {
        setInitializing(false);
      }
    };

    void init();
  }, [capabilities, selectedModel, createConversation, send, ticketId, ticketSubject]);

  const messages = conversation?.messages ?? [];
  const aiAvailable = capabilities?.available ?? false;

  if (!aiAvailable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <Sparkles className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">AI Assistant unavailable</p>
        <p className="text-xs text-muted-foreground">
          The AI Assistant has not been configured for your organization.
        </p>
        <Button variant="ghost" size="sm" onClick={onBack}>Back to Support</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back to Support"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        {ticketSubject && (
          <span className="ml-1 truncate text-xs text-muted-foreground">
            · {ticketSubject}
          </span>
        )}
      </div>

      {/* Context chip */}
      {ticketSubject && (
        <div className="border-b border-border bg-muted/30 px-4 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Context</p>
          <p className="mt-0.5 truncate text-xs font-medium text-foreground">{ticketSubject}</p>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 space-y-4">
          {initializing && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-4/5 rounded-xl" />
              <Skeleton className="ml-auto h-10 w-2/3 rounded-xl" />
            </div>
          )}

          {!initializing && messages.length === 0 && !streaming && (
            <div className="py-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-brand/40 mb-3" />
              <p className="text-sm font-medium text-foreground">
                {ticketSubject ? 'Ask me anything about your ticket' : 'How can I help you today?'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                I can help with FlowERP questions and guide you through the platform.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isLast={idx === messages.length - 1}
              editable={false}
              onRetry={() => undefined}
              onEditSubmit={() => undefined}
            />
          ))}

          {/* Streaming turn */}
          {streaming && turn.text && (
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed">
                {turn.text}
              </div>
            </div>
          )}
          {streaming && !turn.text && <StreamingIndicator turn={turn as StreamingTurn} />}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t border-border">
        {capabilities && (
          <ChatInput
            onSend={(msg) => { if (conversationId) send(msg); }}
            onStop={stop}
            streaming={streaming}
            disabled={initializing || !conversationId || !aiAvailable}
            models={capabilities.models ?? []}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        )}
      </div>
    </div>
  );
}
