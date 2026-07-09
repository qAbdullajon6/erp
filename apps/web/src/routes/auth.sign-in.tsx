'use client';

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLogin, sessionManager } from "@/lib/api/auth";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/sign-in")({
  head: () => ({ meta: [{ title: "Sign In — FlowERP AI" }] }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      toast.success("Signed in successfully");
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(error || "Failed to sign in");
    }
  };

  return (
    <AuthShell
      title="Sign in to FlowERP AI"
      subtitle="Welcome back. Enter your details to continue."
      footer={null}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Work Email</Label>
          <Input
            id="email"
            type="email"
            required
            placeholder="you@company.com"
            className="h-11 bg-background/40"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-brand">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            placeholder="••••••••"
            className="h-11 bg-background/40"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </AuthShell>
  );
}
