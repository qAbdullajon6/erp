'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Pencil,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from './markdown-message';
import { ToolTimeline, type ToolTimelineStep } from './tool-timeline';
import type { AiMessage, AiToolCallSummary } from '@/lib/api/ai';

/// One turn in the transcript.
export function ChatMessage({
  message,
  onRetry,
  isLast,
  editable,
  onEditSubmit,
}: {
  message: AiMessage;
  onRetry?: () => void;
  isLast?: boolean;
  /// True only for the most recent user message, and only while nothing is
  /// streaming — ChatGPT-style edit is scoped to "the last thing you said."
  editable?: boolean;
  onEditSubmit?: (content: string) => void;
}) {
  const isUser = message.role === 'USER';
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-4 animate-in fade-in slide-in-from-bottom-1 duration-300',
        isUser ? 'bg-transparent' : 'bg-surface/40',
      )}
    >
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

        {isUser && editing ? (
          <EditComposer
            initialValue={message.content ?? ''}
            onCancel={() => setEditing(false)}
            onSubmit={(value) => {
              setEditing(false);
              onEditSubmit?.(value);
            }}
          />
        ) : isUser ? (
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

        {isUser && editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit message"
            className={cn(
              'mt-1.5 flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground',
              'group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none',
            )}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}

        {!isUser && !editing && (
          <MessageActions message={message} onRetry={isLast ? onRetry : undefined} isLast={isLast} />
        )}
      </div>
    </div>
  );
}

/// Inline replacement for the message body while editing — same visual
/// language as the main composer, so it doesn't feel like a different control.
function EditComposer({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="rounded-xl border border-brand/40 bg-surface/60 shadow-sm">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const el = e.target;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label="Edit your message"
        rows={1}
        className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        style={{ maxHeight: '300px' }}
      />
      <div className="flex items-center justify-end gap-2 border-t border-border/60 px-2 py-1.5">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onCancel}>
          <X className="h-3 w-3" />
          Cancel
        </Button>
        <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={submit} disabled={!value.trim()}>
          <Check className="h-3 w-3" />
          Save &amp; submit
        </Button>
      </div>
    </div>
  );
}

/// What the assistant DID, above what it said.
///
/// Shown because a tool-using answer is a claim about real data, and a user
/// deciding whether to trust "you have 4 overdue invoices" is entitled to see
/// that it actually called search_invoices rather than guessing. Rendered as
/// the same step-by-step timeline as the live turn, so a message looks
/// identical the instant it finishes streaming and after a page reload.
function ToolCallList({ calls }: { calls: AiToolCallSummary[] }) {
  const steps: ToolTimelineStep[] = calls.map((call) => ({
    key: call.id,
    name: call.name,
    phase:
      call.status === 'SUCCEEDED'
        ? 'done'
        : call.status === 'DENIED'
          ? 'denied'
          : call.status === 'FAILED'
            ? 'failed'
            : 'running',
    durationMs: call.durationMs,
    error: call.error,
  }));

  return (
    <div className="mb-2">
      <ToolTimeline steps={steps} />
    </div>
  );
}

function MessageActions({
  message,
  onRetry,
  isLast,
}: {
  message: AiMessage;
  onRetry?: () => void;
  isLast?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // Client-side only: there is no backend endpoint to persist a rating, so
  // this is an honest "acknowledge the click" affordance rather than a fake
  // API call. It resets on refresh along with the rest of transient UI state.
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const copy = () => {
    void navigator.clipboard.writeText(message.content ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tokens = (message.promptTokens ?? 0) + (message.completionTokens ?? 0);

  return (
    <div
      className={cn(
        'mt-2 flex items-center gap-1 transition-opacity',
        isLast ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy response'}
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
          aria-label="Regenerate response"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </Button>
      )}

      <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setFeedback((prev) => (prev === 'up' ? null : 'up'))}
        aria-label={feedback === 'up' ? 'Remove positive feedback' : 'Good response'}
        aria-pressed={feedback === 'up'}
        className={cn(
          'h-7 w-7 text-muted-foreground hover:text-foreground',
          feedback === 'up' && 'text-success hover:text-success',
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" fill={feedback === 'up' ? 'currentColor' : 'none'} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setFeedback((prev) => (prev === 'down' ? null : 'down'))}
        aria-label={feedback === 'down' ? 'Remove negative feedback' : 'Bad response'}
        aria-pressed={feedback === 'down'}
        className={cn(
          'h-7 w-7 text-muted-foreground hover:text-foreground',
          feedback === 'down' && 'text-destructive hover:text-destructive',
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" fill={feedback === 'down' ? 'currentColor' : 'none'} />
      </Button>

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
