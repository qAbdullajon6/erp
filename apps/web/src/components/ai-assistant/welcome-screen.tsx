'use client';

import {
  ClipboardList,
  Package,
  Receipt,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/lib/api/auth';

interface WelcomeScreenProps {
  suggestions: string[];
  onSuggestion: (text: string) => void;
  available: boolean;
  /// `available` is false both when no provider key is set AND when the
  /// signed-in role is denied the Copilot outright (e.g. DRIVER) — those need
  /// different copy, so the unavailable banner needs this to tell them apart.
  configured: boolean;
}

/// Picks a suggestion's icon from its own wording rather than a second
/// backend field — the prompt library already writes ERP-flavored copy
/// ("Show today's delayed deliveries", "Which invoices are overdue?"), so
/// the keywords are already right there.
function iconFor(suggestion: string): LucideIcon {
  const s = suggestion.toLowerCase();
  if (/invoice|revenue|financ|balance|overdue|payment/.test(s)) return Receipt;
  if (/customer|client/.test(s)) return Users;
  if (/driver|vehicle|fleet|dispatch/.test(s)) return Truck;
  if (/order|delivery|deliveries|shipment/.test(s)) return Package;
  return ClipboardList;
}

function greeting(hour: number): string {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeScreen({ suggestions, onSuggestion, available, configured }: WelcomeScreenProps) {
  const { data: currentUser } = useCurrentUser();
  const name = currentUser?.user.firstName;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-12 animate-in fade-in duration-300">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-brand-foreground shadow-lg shadow-brand/20">
        <Sparkles className="h-7 w-7" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          {name ? `${greeting(new Date().getHours())}, ${name}` : 'FlowERP Copilot'}
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Ask questions about your orders, customers, dispatches, and finances.
          I can search your data, generate reports, and help you take action.
        </p>
      </div>

      {!available && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-center text-sm text-warning">
          {configured
            ? 'The AI Copilot is not available for your role.'
            : 'AI is not configured. Ask your administrator to set an API key.'}
        </div>
      )}

      {available && suggestions.length > 0 && (
        <div className="grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
          {suggestions.map((s, i) => {
            const Icon = iconFor(s);
            return (
              <Button
                key={s}
                variant="outline"
                className={cn(
                  'h-auto justify-start gap-2.5 whitespace-normal px-4 py-3 text-left text-xs text-muted-foreground',
                  'transition-all duration-150 hover:-translate-y-0.5 hover:text-foreground hover:shadow-md',
                  'animate-in fade-in slide-in-from-bottom-1',
                )}
                style={{ animationDelay: `${i * 40}ms`, animationDuration: '300ms', animationFillMode: 'backwards' }}
                onClick={() => onSuggestion(s)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-brand" />
                {s}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
