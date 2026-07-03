import Link from "next/link";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { notificationPriorityMeta } from "@/lib/status-meta";
import type { IntentCategory } from "@/lib/ai-assistant";
import type { ChatMessage as ChatMessageData } from "@/lib/ai-conversation";

const categoryLabels: Record<IntentCategory, string> = {
  operations: "Operations",
  finance: "Finance",
  fleet: "Fleet",
  customers: "Customers",
  reports: "Reports",
};

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

  const response = message.response;
  if (!response) return null;

  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-4" />
      </div>
      <div className="max-w-[85%] space-y-3 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {categoryLabels[response.category]}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            Local demo intelligence — based on current ERP data
          </span>
        </div>

        <p>{response.answer}</p>

        {response.metrics && response.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 sm:grid-cols-3">
            {response.metrics.map((m) => (
              <div key={m.label} className="rounded-md bg-muted/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    m.tone === "negative" && "text-destructive",
                    m.tone === "positive" && "text-chart-2",
                  )}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {response.table && response.table.rows.length > 0 && (
          <div className="overflow-x-auto border-t border-border pt-2">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {response.table.columns.map((c) => (
                    <th key={c.key} className="px-2 py-1 text-left font-medium text-muted-foreground">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {response.table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    {response.table!.columns.map((c) => (
                      <td key={c.key} className="px-2 py-1">
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {response.emptyNote && (!response.table || response.table.rows.length === 0) && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">{response.emptyNote}</p>
        )}

        {response.recommendations && response.recommendations.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Recommended actions
            </p>
            {response.recommendations.map((r, i) => (
              <Link
                key={i}
                href={r.href}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs transition-colors hover:bg-muted"
              >
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className={cn("text-[9px]", notificationPriorityMeta[r.priority].badgeClass)}>
                    {notificationPriorityMeta[r.priority].label}
                  </Badge>
                  {r.label}
                </span>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}

        {response.explanation && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">{response.explanation}</p>
        )}

        {response.links && response.links.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-2">
            {response.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {l.label}
                <ArrowUpRight className="size-3" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
