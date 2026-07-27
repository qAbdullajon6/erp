'use client';

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { TextField } from "@/components/auth/TextField";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormAlert } from "@/components/shared/form-alert";
import { useLogin } from "@/lib/api/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/auth/sign-in")({
  head: () => ({ meta: [{ title: "Sign In — FlowERP AI" }] }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const { login, loading } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      toast.success("Signed in successfully");
      navigate({ to: "/app", replace: true });
    } catch (err) {
      // Read the thrown error, not the hook's `error` state — that state has
      // not re-rendered yet at this point, so it was always the previous value
      // (null on the first failed attempt).
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  };

  return (
    <AuthShell
      title="Sign in to FlowERP AI"
      subtitle="Welcome back. Enter your details to continue."
      footer={
        <>
          Need an account?{" "}
          <a href="/#contact" className="font-medium text-brand hover:underline">
            Talk to our team
          </a>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <div key={error} className="auth-shake">
            <FormAlert message={error} />
          </div>
        )}

        <TextField
          id="email"
          label="Work Email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          icon={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />

        <PasswordField
          id="password"
          label="Password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          labelExtra={
            <Link to="/auth/forgot-password" className="text-xs text-muted-foreground transition-colors hover:text-brand">
              Forgot password?
            </Link>
          }
        />

        <SubmitButton loading={loading} loadingLabel="Signing in…">
          Sign In
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
