'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, RefreshCw, XCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExecutionTrace } from '@/lib/api/ai';

export function ExecutionTracePanel({ trace }: { trace: ExecutionTrace }) {
  const [expanded, setExpanded] = useState(false);

  if (trace.toolsCalled.length === 0) return null;

  return (
    <div className="mx-4 mt-1 mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Clock className="h-3 w-3" />
        {(trace.totalDurationMs / 1000).toFixed(1)}s
        <span className="mx-1">·</span>
        {trace.toolsCalled.length} tool{trace.toolsCalled.length !== 1 ? 's' : ''}
        {trace.retries > 0 && (
          <>
            <span className="mx-1">·</span>
            <RefreshCw className="h-3 w-3" />
            {trace.retries} retry
          </>
        )}
        {trace.failures > 0 && (
          <>
            <span className="mx-1">·</span>
            <XCircle className="h-3 w-3 text-destructive" />
            {trace.failures} failed
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="space-y-1">
            {trace.toolsCalled.map((tool, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Wrench className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-muted-foreground">{tool.name}</span>
                <span
                  className={cn(
                    'rounded px-1 py-0.5',
                    tool.status === 'SUCCEEDED' && 'bg-success/10 text-success',
                    tool.status === 'FAILED' && 'bg-destructive/10 text-destructive',
                    tool.status === 'DENIED' && 'bg-warning/10 text-warning',
                  )}
                >
                  {tool.status.toLowerCase()}
                </span>
                <span className="ml-auto text-muted-foreground">{tool.durationMs}ms</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
            {trace.iterations} iteration{trace.iterations !== 1 ? 's' : ''}
            {trace.recovered > 0 && ` · ${trace.recovered} recovered from failure`}
          </div>
        </div>
      )}
    </div>
  );
}
