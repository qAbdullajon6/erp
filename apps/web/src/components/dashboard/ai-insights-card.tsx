import { Sparkles } from "lucide-react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useAiCapabilities } from "@/hooks/use-ai";

export function AiInsightsCard() {
  const { data: capabilities } = useAiCapabilities();
  const configured = capabilities?.configured ?? false;

  return (
    <SurfaceCard className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Sparkles className="h-4 w-4" />
      </span>
      <div>
        <p className="font-medium text-foreground">AI Insights</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {configured
            ? "Ask the AI Copilot for insights about your data."
            : "Not enabled yet"}
        </p>
      </div>
    </SurfaceCard>
  );
}
