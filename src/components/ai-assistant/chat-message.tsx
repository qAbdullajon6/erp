import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantAnswer } from "@/lib/ai-assistant";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  question?: string;
  answer?: AssistantAnswer;
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.question}
        </div>
      </div>
    );
  }

  const answer = message.answer;

  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-4" />
      </div>
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm">
        <p>{answer?.summary}</p>
        {answer?.items && answer.items.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-2">
            {answer.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    item.tone === "negative" && "text-destructive",
                    item.tone === "positive" && "text-chart-2",
                  )}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}
        {answer?.items && answer.items.length === 0 && answer.emptyNote && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            {answer.emptyNote}
          </p>
        )}
      </div>
    </div>
  );
}
