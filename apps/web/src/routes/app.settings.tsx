import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/components/settings/settings-view";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [{ title: "Settings — FlowERP AI" }],
  }),
  component: SettingsView,
});
