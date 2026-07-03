"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, type ApiOrganizationDetail } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

type LoadState = "loading" | "loaded" | "error";

export function OrganizationSettingsView() {
  const { callApi } = useApiSession();
  const [organization, setOrganization] = React.useState<ApiOrganizationDetail | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState("");
  const [defaultCurrency, setDefaultCurrency] = React.useState("");
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadState("loading");
      setErrorMessage(null);
    });

    callApi((token) => apiClient.getCurrentOrganization(token)).then(
      (org) => {
        if (cancelled) return;
        setOrganization(org);
        setName(org.name);
        setTimezone(org.timezone);
        setDefaultCurrency(org.defaultCurrency);
        setLoadState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load organization");
        setLoadState("error");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [callApi, reloadToken]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    setSaveError(null);
    try {
      const updated = await callApi((token) =>
        apiClient.updateOrganization(token, { name, timezone, defaultCurrency }),
      );
      setOrganization(updated);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Failed to save changes");
    }
  }

  if (loadState === "loading") {
    return (
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading organization…
      </p>
    );
  }

  if (loadState === "error" || !organization) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle className="size-5 text-destructive" />
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReloadToken((n) => n + 1)}
          className="gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 py-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Slug</p>
            <p className="font-mono">{organization.slug}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Not editable in this phase.</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge variant="outline">{organization.status}</Badge>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="org-timezone">Timezone</Label>
              <Input
                id="org-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Asia/Tashkent"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-currency">Default currency</Label>
              <Input
                id="org-currency"
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>
          </div>

          {saveState === "error" && saveError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              {saveError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saveState === "saving"} className="gap-1.5">
              {saveState === "saving" && <Loader2 className="size-4 animate-spin" />}
              {saveState === "saving" ? "Saving…" : "Save changes"}
            </Button>
            {saveState === "saved" && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                Saved
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
