'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeScreenProps {
  suggestions: string[];
  onSuggestion: (text: string) => void;
  available: boolean;
}

export function WelcomeScreen({ suggestions, onSuggestion, available }: WelcomeScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-brand-foreground shadow-lg shadow-brand/20">
        <Sparkles className="h-7 w-7" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">FlowERP Copilot</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Ask questions about your orders, customers, dispatches, and finances.
          I can search your data, generate reports, and help you take action.
        </p>
      </div>

      {!available && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-center text-sm text-warning">
          AI is not configured. Ask your administrator to set an API key.
        </div>
      )}

      {available && suggestions.length > 0 && (
        <div className="grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              variant="outline"
              className="h-auto justify-start whitespace-normal px-4 py-3 text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSuggestion(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
