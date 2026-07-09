import { createFileRoute } from "@tanstack/react-router";
import { ReportsView } from "@/components/reports/reports-view";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [{ title: "Reports — FlowERP AI" }],
  }),
  component: ReportsView,
});
