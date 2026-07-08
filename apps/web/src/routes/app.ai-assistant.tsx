import { createFileRoute } from "@tanstack/react-router";
import { AiAssistantView } from "@/components/ai-assistant/ai-assistant-view";

export const Route = createFileRoute("/app/ai-assistant")({
  component: AiAssistantPage,
});

function AiAssistantPage() {
  return <AiAssistantView />;
}
