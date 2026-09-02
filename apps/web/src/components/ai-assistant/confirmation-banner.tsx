'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { summarizeConfirmation } from './confirmation-format';

interface ConfirmationBannerProps {
  action: string;
  details: Record<string, unknown>;
  /// tool name → description, from AiCapabilities.tools — used only as a
  /// fallback label for a tool this card has no curated formatter for.
  toolDescriptions?: Record<string, string>;
  onConfirm: () => void;
  onDeny: () => void;
}

interface RawCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export function ConfirmationBanner({
  action,
  details,
  toolDescriptions,
  onConfirm,
  onDeny,
}: ConfirmationBannerProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const calls = Array.isArray(details.calls) ? (details.calls as RawCall[]) : [];

  return (
    <div className="mx-4 my-2 overflow-hidden rounded-xl border border-warning/40 bg-warning/5">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Confirmation required</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{action}</p>

          {/* One card per action — the JSON payload is never shown here, only
              a human summary. Technical Details below has the raw form for
              anyone who needs to verify exactly what will run. */}
          <div className="mt-3 flex flex-col gap-2">
            {calls.map((call, i) => {
              const summary = summarizeConfirmation(call, toolDescriptions?.[call.tool]);
              return (
                <div key={i} className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{summary.title}</span>
                    {summary.entity && (
                      <span className="truncate text-xs text-muted-foreground">{summary.entity}</span>
                    )}
                  </div>
                  {summary.fields.length > 0 && (
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {summary.fields.map((f) => (
                        <div key={f.label} className="contents">
                          <dt className="text-muted-foreground">{f.label}</dt>
                          <dd className="truncate text-foreground">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button size="sm" onClick={onConfirm} className="gap-1">
                <Check className="h-3.5 w-3.5" />
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={onDeny} className="gap-1">
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setShowTechnical((v) => !v)}
              aria-expanded={showTechnical}
              className="flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40"
            >
              {showTechnical ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Technical details
            </button>
          </div>

          {showTechnical && (
            <div className="mt-2 rounded-md bg-muted/50 p-2">
              <pre className="overflow-x-auto text-xs text-muted-foreground">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
