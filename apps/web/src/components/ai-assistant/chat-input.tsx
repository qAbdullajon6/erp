'use client';

import { useRef, useState, useCallback } from 'react';
import { ArrowUp, Paperclip, Square, Sparkles, UploadCloud } from 'lucide-react';
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
  // Visual only — dragging a file over the composer previews where an
  // attachment would land. Nothing is read, uploaded, or sent; dropping just
  // clears the indicator, matching the "prepare the UI, don't implement
  // uploads yet" scope of this pass.
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
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

  // Counts enter/leave depth because a drag over a child element fires
  // dragleave on the parent too — without the counter the overlay would
  // flicker off every time the cursor crosses an inner border.
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
  };

  return (
    <div
      className="relative shrink-0 border-t border-border/60 bg-background px-4 py-3"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Fades the last message into the composer instead of a hard seam. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent"
      />

      {isDraggingFile && (
        <div className="absolute inset-2 z-20 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/60 bg-background/95 text-sm text-muted-foreground animate-in fade-in duration-150">
          <UploadCloud className="h-4 w-4 text-brand" />
          Attachments aren&apos;t supported yet
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            'relative rounded-2xl border border-border/80 bg-surface/60 shadow-sm transition-all',
            'focus-within:border-brand/50 focus-within:shadow-md focus-within:ring-1 focus-within:ring-brand/20',
          )}
        >
          <button
            type="button"
            disabled
            aria-label="Attach files (coming soon)"
            title="Attachments are coming soon"
            className="absolute bottom-2 left-2 flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask FlowERP AI anything…"
            aria-label="Message FlowERP AI"
            rows={1}
            disabled={disabled}
            className={cn(
              'w-full resize-none bg-transparent py-3 pl-11 text-sm text-foreground',
              streaming ? 'pr-36' : 'pr-12',
              'placeholder:text-muted-foreground focus:outline-none',
              'disabled:opacity-50',
            )}
            style={{ maxHeight: '200px' }}
          />

          <div className="absolute bottom-2 right-2">
            {streaming ? (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                onClick={onStop}
                aria-label="Stop generating"
              >
                <Square className="h-3 w-3" fill="currentColor" />
                Stop generating
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={submit}
                disabled={!value.trim() || disabled}
                aria-label="Send message"
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
                <SelectTrigger
                  aria-label="Select AI model"
                  className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:text-foreground"
                >
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
