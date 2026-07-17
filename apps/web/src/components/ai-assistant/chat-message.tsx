'use client';

import { useState } from 'react';
import { Check, Copy, RefreshCw, Sparkles, User, Wrench, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from './markdown-message';
import type { AiMessage, AiToolCallSummary } from '@/lib/api/ai';

/// One turn in the transcript.
export function ChatMessage({
  message,
  onRetry,
  isLast,
}: {
  message: AiMessage;
  onRetry?: () => void;
  isLast?: boolean;
}) {
  const isUser = message.role === 'USER';

  return (
    <div className={cn('flex gap-3 px-4 py-4', isUser ? 'bg-transparent' : 'bg-surface/40')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          isUser ? 'bg-muted text-muted-foreground' : 'bg-gradient-brand text-brand-foreground',
        )}
        aria-hidden
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {isUser ? 'You' : 'Copilot'}
          </span>
          {message.model && !isUser && (
            <span className="text-xs text-muted-foreground">{message.model}</span>
          )}
          {message.filtered && (
            // The user is told when their answer was altered. Silently redacting
            // and presenting the result as the model's own words would be a lie.
            <span
              className="flex items-center gap-1 text-xs text-warning"
              title="Part of this response was withheld by the security filter"
            >
              <ShieldAlert className="h-3 w-3" />
              filtered
            </span>
          )}
        </div>

        {message.toolCalls.length > 0 && <ToolCallList calls={message.toolCalls} />}

        {isUser ? (
          // User text is rendered as plain text, never as markdown: it is
          // theirs, and running it through a renderer would let a pasted
          // snippet reformat the transcript.
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
            {message.content}
          </p>
        ) : message.content ? (
          <MarkdownMessage content={message.content} />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {message.finishReason === 'cancelled' ? 'Stopped.' : 'No response.'}
          </p>
        )}

        {!isUser && (
          <MessageActions message={message} onRetry={isLast ? onRetry : undefined} />
        )}
      </div>
    </div>
  );
}

/// What the assistant DID, above what it said.
///
/// Shown because a tool-using answer is a claim about real data, and a user
/// deciding whether to trust "you have 4 overdue invoices" is entitled to see
/// that it actually called search_invoices rather than guessing.
function ToolCallList({ calls }: { calls: AiToolCallSummary[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {calls.map((call) => (
        <span
          key={call.id}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
            call.status === 'SUCCEEDED' && 'border-success/30 bg-success/10 text-success',
            call.status === 'DENIED' && 'border-warning/30 bg-warning/10 text-warning',
            (call.status === 'FAILED' || call.status === 'PENDING') &&
              'border-destructive/30 bg-destructive/10 text-destructive',
          )}
          title={call.error ?? `${call.name} (${call.durationMs ?? 0}ms)`}
        >
          <Wrench className="h-3 w-3" />
          {call.name}
        </span>
      ))}
    </div>
  );
}

function MessageActions({ message, onRetry }: { message: AiMessage; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(message.content ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tokens = (message.promptTokens ?? 0) + (message.completionTokens ?? 0);

  return (
    <div className="mt-2 flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={copy}
        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        disabled={!message.content}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>

      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </Button>
      )}

      {tokens > 0 && (
        // Cost is visible per turn, because every turn spends real money and a
        // user who cannot see that has no way to moderate it.
        <span className="ml-1 text-xs text-muted-foreground" title="Tokens used for this turn">
          {tokens.toLocaleString()} tokens
          {message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ''}
        </span>
      )}
    </div>
  );
}
