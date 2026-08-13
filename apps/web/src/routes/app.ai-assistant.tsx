import { createFileRoute } from "@tanstack/react-router";
import { AiAssistantView } from "@/components/ai-assistant/ai-assistant-view";
import { asSearchString } from "@/lib/search-params";

export type AiAssistantSearch = {
  conversationId?: string;
};

export const Route = createFileRoute("/app/ai-assistant")({
  validateSearch: (search: Record<string, unknown>): AiAssistantSearch => ({
    conversationId: asSearchString(search.conversationId),
  }),
  component: AiAssistantPage,
});

function AiAssistantPage() {
  return <AiAssistantView />;
}
