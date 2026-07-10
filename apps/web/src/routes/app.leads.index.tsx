import { createFileRoute } from "@tanstack/react-router";
import { LeadsList } from "@/components/leads/leads-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/leads/")({
  head: () => ({ meta: [{ title: "Leads — FlowERP AI" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <ProtectedApiRoute>
      <LeadsList />
    </ProtectedApiRoute>
  );
}
