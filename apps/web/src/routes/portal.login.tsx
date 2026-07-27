'use client';

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { TextField } from "@/components/auth/TextField";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormAlert } from "@/components/shared/form-alert";
import { usePortalLogin } from "@/lib/api/portal-auth";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Mail } from "lucide-react";

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
    <AuthShell
      title="Customer Portal"
      subtitle="Sign in to track your orders, invoices, and deliveries."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <div key={error} className="auth-shake">
            <FormAlert message={error} />
          </div>
        )}

        <TextField
          id="email"
          label="Email"
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

        <TextField
          id="organizationSlug"
          label="Organization"
          hint="Optional — only needed if your email is used across multiple organizations."
          type="text"
          placeholder="your-company"
          icon={<Building2 className="h-4 w-4" />}
          value={organizationSlug}
          onChange={(e) => setOrganizationSlug(e.target.value)}
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
        />

        <SubmitButton loading={loading} loadingLabel="Signing in…">
          Sign In
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
