'use client';

import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FriendlyError {
  title: string;
  /// Only set when the friendly title is actually a paraphrase — i.e. there
  /// is something extra worth keeping behind "Technical details". When the
  /// raw message IS the friendly message, there is nothing to hide.
  technical?: string;
}

/// Turns whatever the SSE `error` event carried — a provider error message,
/// a rate-limit notice, a fetch failure — into plain language. The raw text
/// is never the first thing shown; it survives underneath, expandable, for
/// anyone who needs to file a bug with the real detail.
function toFriendlyError(raw: string): FriendlyError {
  if (/credit|quota/i.test(raw) && /limit|exceed/i.test(raw)) {
    return { title: "You've reached your AI usage limit for this plan.", technical: raw };
  }
  if (/rate.?limit|too many requests/i.test(raw)) {
    return { title: 'Too many requests — please wait a moment and try again.', technical: raw };
  }
  if (/failed to fetch|networkerror|network error|ECONNREFUSED/i.test(raw)) {
    return { title: "Couldn't reach the AI service. Check your connection and try again.", technical: raw };
  }
  if (/unauthorized|401|session/i.test(raw)) {
    return { title: 'Your session may have expired — try refreshing the page.', technical: raw };
  }
  if (/timeout|timed out/i.test(raw)) {
    return { title: 'The assistant took too long to respond. Please try again.', technical: raw };
  }
  return { title: 'Something went wrong while generating a response.', technical: raw };
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const friendly = toFriendlyError(message);
  const hasTechnical = !!friendly.technical && friendly.technical !== friendly.title;

  return (
    <div className="mx-4 my-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">{friendly.title}</p>

          <div className="mt-2 flex items-center gap-3">
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="h-7 gap-1.5 text-xs">
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
            {hasTechnical && (
              <button
                type="button"
                onClick={() => setShowTechnical((v) => !v)}
                aria-expanded={showTechnical}
                className="flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40"
              >
                {showTechnical ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Technical details
              </button>
            )}
          </div>

          {hasTechnical && showTechnical && (
            <div className="mt-2 rounded-md bg-muted/50 p-2">
              <p className="break-words font-mono text-xs text-muted-foreground">{friendly.technical}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
