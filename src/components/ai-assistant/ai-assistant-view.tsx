"use client";

import * as React from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { askAssistant, suggestedQuestions } from "@/lib/ai-assistant";
import { useAppData } from "@/lib/store";
import { ChatMessage, type ChatMessageData } from "@/components/ai-assistant/chat-message";

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

export function AiAssistantView() {
  const { orders, drivers, vehicles, invoices, expenses, customers } = useAppData();
  const [messages, setMessages] = React.useState<ChatMessageData[]>(() => [
    {
      id: nextMessageId(),
      role: "assistant",
      answer: {
        summary:
          "Hi, I'm your FlowERP AI operations assistant. Ask me about deliveries, drivers, debtors, revenue or routes — I'll answer from your live data.",
      },
    },
  ]);
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    const answer = askAssistant(trimmed, { orders, drivers, vehicles, invoices, expenses, customers });

    setMessages((prev) => [
      ...prev,
      { id: nextMessageId(), role: "user", question: trimmed },
      { id: nextMessageId(), role: "assistant", answer },
    ]);
    setInput("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleAsk(input);
  }

  return (
    <Card className="flex h-[calc(100vh-8rem)] flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          <div ref={scrollRef} />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleAsk(q)}
              className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about deliveries, drivers, debtors, revenue..."
              className="pl-9"
            />
          </div>
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
