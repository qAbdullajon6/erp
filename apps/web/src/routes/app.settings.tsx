import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and workspace settings</p>
      </div>
      <div className="rounded-lg border border-border/60 bg-surface/60 p-6">
        <p className="text-muted-foreground">Settings page coming soon...</p>
      </div>
    </div>
  );
}
