'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
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
import { ExecutionTracePanel } from './execution-trace';
import { StreamingIndicator } from './streaming-indicator';
import { WelcomeScreen } from './welcome-screen';
import { MarkdownMessage } from './markdown-message';

export function AiAssistantView() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [readOnlyMode, setReadOnlyMode] = useState(false);

  const { data: capabilities, isPending: loadingCapabilities } = useAiCapabilities();
  const { data: conversation } = useAiConversation(activeConversationId);
  const createConversation = useCreateConversation();
  const { send, stop, streaming, turn, error } = useChatStream(activeConversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (capabilities?.defaultModel && !selectedModel) {
      setSelectedModel(capabilities.defaultModel);
    }
  }, [capabilities?.defaultModel, selectedModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages, turn.text, turn.tools]);

  const handleNew = useCallback(async () => {
    const conv = await createConversation.mutateAsync({
      model: selectedModel || undefined,
      readOnly: readOnlyMode || undefined,
    });
    setActiveConversationId(conv.id);
  }, [createConversation, selectedModel, readOnlyMode]);

  const handleSend = useCallback(
    async (message: string) => {
      if (!activeConversationId) {
        const conv = await createConversation.mutateAsync({
          model: selectedModel || undefined,
          readOnly: readOnlyMode || undefined,
        });
        setActiveConversationId(conv.id);
        setTimeout(() => send(message), 50);
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
  const showWelcome = !activeConversationId || (messages.length === 0 && !streaming);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border/60">
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
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium text-foreground">
              {conversation?.title ?? 'New Conversation'}
            </h2>
          </div>

          {conversation?.readOnly && (
            <span className="flex items-center gap-1 rounded-md border border-brand/20 bg-brand/5 px-2 py-0.5 text-xs text-brand">
              <Eye className="h-3 w-3" />
              Read-only
            </span>
          )}

          {!activeConversationId && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={readOnlyMode}
                onCheckedChange={setReadOnlyMode}
                className="h-4 w-7"
              />
              Observe only
            </label>
          )}

          {conversation && (
            <span className="text-xs text-muted-foreground">
              {(conversation.totalTokens ?? 0).toLocaleString()} tokens
            </span>
          )}
        </div>

        {/* Messages area */}
        <div className="relative flex-1 overflow-hidden">
          {showWelcome ? (
            <WelcomeScreen
              suggestions={capabilities?.suggestions ?? []}
              onSuggestion={handleSuggestion}
              available={capabilities?.available ?? false}
            />
          ) : (
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="mx-auto max-w-3xl pb-4">
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLast={i === messages.length - 1}
                    onRetry={i === messages.length - 1 ? handleRetry : undefined}
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
                    onConfirm={() => {
                      if (activeConversationId) {
                        void aiAPI.confirm(activeConversationId, true);
                        send('Yes, proceed.');
                      }
                    }}
                    onDeny={() => {
                      if (activeConversationId) {
                        void aiAPI.confirm(activeConversationId, false);
                        send('No, cancel that.');
                      }
                    }}
                  />
                )}

                {/* Execution trace (shown after turn completes) */}
                {turn.trace && <ExecutionTracePanel trace={turn.trace} />}

                {error && (
                  <div className="mx-4 my-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>
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
