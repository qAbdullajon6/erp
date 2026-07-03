"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiEnabled } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

function ErrorNotice({ message }: { message: string }) {
  const isConnectionError = message.startsWith("Could not reach the API");
  const Icon = isConnectionError ? WifiOff : AlertTriangle;
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, session, status, errorMessage } = useApiSession();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [organizationSlug, setOrganizationSlug] = React.useState("");
  const [showOrgSlug, setShowOrgSlug] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);

  const redirectTarget = searchParams.get("redirect") || "/customers";

  React.useEffect(() => {
    if (session) {
      router.replace(redirectTarget);
    }
  }, [session, redirectTarget, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password, organizationSlug.trim() || undefined, rememberMe);
    } catch {
      // surfaced via errorMessage below
    }
  }

  const apiDisabled = !isApiEnabled();

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-5 py-7">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Sign in to Connected Mode</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your FlowERP AI account to use API-backed modules.
          </p>
        </div>

        {apiDisabled && (
          <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Connected Mode is disabled in this environment (demo mode). Set{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_DATA_MODE=api</code> to sign in for
            real — see docs/CONNECTED_MODE_AUTH_UI.md.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowOrgSlug((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={`size-3.5 transition-transform ${showOrgSlug ? "rotate-180" : ""}`} />
              Belong to more than one organization?
            </button>
            {showOrgSlug && (
              <div className="mt-2 space-y-1.5">
                <Label htmlFor="login-org-slug">Organization slug</Label>
                <Input
                  id="login-org-slug"
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value)}
                  placeholder="e.g. acme-logistics"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to sign into your oldest active organization by default.
                </p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Remember me on this device
          </label>
          <p className="-mt-2 text-xs text-muted-foreground">
            Unchecked: you&apos;ll need to sign in again after closing this tab. See
            docs/CONNECTED_MODE_AUTH_UI.md for what this actually stores.
          </p>

          {errorMessage && <ErrorNotice message={errorMessage} />}

          <Button type="submit" disabled={status === "loading"} className="w-full gap-1.5">
            {status === "loading" && <Loader2 className="size-4 animate-spin" />}
            {status === "loading" ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="space-y-1 text-center text-sm text-muted-foreground">
          <p>
            No account yet?{" "}
            <Link href="/auth/register" className="font-medium text-foreground underline underline-offset-2">
              Register an organization
            </Link>
          </p>
          <p>
            <Link href="/auth/forgot-password" className="underline underline-offset-2">
              Forgot your password?
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}
