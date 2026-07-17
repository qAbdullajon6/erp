'use client';

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePortalLogin } from "@/lib/api/portal-auth";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Eye, EyeOff, Truck } from "lucide-react";

export const Route = createFileRoute("/portal/login")({
  head: () => ({ meta: [{ title: "Customer Portal — Sign In" }] }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const { login, loading } = usePortalLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password, organizationSlug: organizationSlug || undefined });
      toast.success("Signed in successfully");
      navigate({ to: "/portal", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
              <Truck className="h-6 w-6 text-brand" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Customer Portal</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to track your orders, invoices, and deliveries.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-surface/80 p-8 shadow-elevated backdrop-blur">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                  className="h-11 bg-background/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="organizationSlug">Organization (optional)</Label>
                <Input
                  id="organizationSlug"
                  type="text"
                  placeholder="your-company"
                  className="h-11 bg-background/40"
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 bg-background/40 pr-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
