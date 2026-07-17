'use client';

import { useRef, useState, useCallback } from 'react';
import { ArrowUp, Square, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AiModelInfo } from '@/lib/api/ai';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  models: AiModelInfo[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function ChatInput({
  onSend,
  onStop,
  streaming,
  disabled,
  models,
  selectedModel,
  onModelChange,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, streaming, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-border/60 bg-background px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            'relative rounded-xl border border-border/80 bg-surface/60 transition-colors',
            'focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-brand/20',
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your ERP data…"
            rows={1}
            disabled={disabled}
            className={cn(
              'w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-foreground',
              'placeholder:text-muted-foreground focus:outline-none',
              'disabled:opacity-50',
            )}
            style={{ maxHeight: '200px' }}
          />

          <div className="absolute bottom-2 right-2">
            {streaming ? (
              <Button
                size="icon"
                variant="destructive"
                className="h-7 w-7 rounded-lg"
                onClick={onStop}
                title="Stop generating"
              >
                <Square className="h-3 w-3" fill="currentColor" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={submit}
                disabled={!value.trim() || disabled}
                title="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-muted-foreground" />
            {models.length > 1 ? (
              <Select value={selectedModel} onValueChange={onModelChange}>
                <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">
                {models[0]?.label ?? 'AI'}
              </span>
            )}
          </div>

          <span className="text-xs text-muted-foreground">
            Shift+Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}
