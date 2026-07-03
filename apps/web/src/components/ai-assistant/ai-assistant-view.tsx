"use client";

import * as React from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { askAssistant, suggestedPromptsByCategory, type IntentCategory } from "@/lib/ai-assistant";
import { useAppData } from "@/lib/store";
import { useNotificationSettings } from "@/lib/notification-settings";
import { useAiConversation } from "@/lib/ai-conversation";
import { useRole } from "@/lib/role";
import { visibleAiPromptCategories } from "@/lib/permissions";
import { ChatMessage } from "@/components/ai-assistant/chat-message";

const categoryLabels: Record<IntentCategory, string> = {
  operations: "Operations",
  finance: "Finance",
  fleet: "Fleet",
  customers: "Customers",
  reports: "Reports",
};

export function AiAssistantView() {
  const { orders, drivers, vehicles, invoices, expenses, customers } = useAppData();
  const { settings } = useNotificationSettings();
  const { role } = useRole();
  const { messages, addUserMessage, addAssistantMessage, clearConversation } = useAiConversation();
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const visibleCategories = visibleAiPromptCategories(role);

  function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isTyping) return;

    setError(null);
    addUserMessage(trimmed);
    setInput("");
    setIsTyping(true);

    window.setTimeout(() => {
      try {
        const response = askAssistant(trimmed, {
          orders,
          drivers,
          vehicles,
          invoices,
          expenses,
          customers,
          notificationThresholds: settings.thresholds,
        });
        addAssistantMessage(response);
      } catch {
        setError("Something went wrong answering that — try rephrasing your question.");
      } finally {
        setIsTyping(false);
      }
    }, 450);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleAsk(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(input);
    }
  }

  const isEmpty = messages.length === 1;

  return (
    <Card className="flex h-[calc(100vh-8rem)] flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Local demo intelligence — based on current ERP data, no external AI API
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            onClick={clearConversation}
          >
            <Trash2 className="size-3.5" />
            Clear conversation
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {isTyping && (
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
          {error && (
            <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          {isEmpty && (
            <p className="text-xs text-muted-foreground">
              Try asking about deliveries, invoices, fleet status, customers, or reports.
            </p>
          )}
          {visibleCategories.map((cat) => (
            <div key={cat} className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                {categoryLabels[cat]}
              </Badge>
              {suggestedPromptsByCategory[cat].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleAsk(q)}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about deliveries, drivers, invoices, customers, reports... (Enter to send, Shift+Enter for newline)"
            className="min-h-11 flex-1 resize-none"
            rows={1}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isTyping}>
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
