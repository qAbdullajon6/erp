import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function AiAssistantPage() {
  return (
    <ComingSoon
      icon={Sparkles}
      title="AI Operations Assistant"
      description="Ask questions like “Which deliveries are delayed today?” and get answers grounded in your live data. Coming next."
    />
  );
}
