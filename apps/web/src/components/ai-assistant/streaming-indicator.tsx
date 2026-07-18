'use client';

import { Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamingTurn } from '@/hooks/use-ai';

export function StreamingIndicator({ turn }: { turn: StreamingTurn }) {
  const activeTools = turn.tools.filter((t) => t.status === 'running');

  if (activeTools.length === 0 && !turn.text) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-brand text-brand-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
        <span className="text-sm text-muted-foreground">Thinking…</span>
      </div>
    );
  }

  if (activeTools.length > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
          {activeTools.map((tool) => (
            <span
              key={tool.name}
              className="inline-flex items-center gap-1 rounded-md border border-brand/20 bg-brand/5 px-1.5 py-0.5 text-xs text-brand"
            >
              <Wrench className="h-3 w-3" />
              {formatToolName(tool.name)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ');
}
