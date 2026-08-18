'use client';

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { TextField } from "@/components/auth/TextField";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormAlert } from "@/components/shared/form-alert";
import { openDemoModal, DemoModal } from "@/components/site/DemoModal";
import { useLogin } from "@/lib/api/auth";
import { isSafeRedirect } from "@/lib/auth/redirect";

export type LoginSearch = {
  /// Where to land after signing in. Set by the session guard when it bounces
  /// someone off a deep link, so a shared link to an order survives the
  /// detour through this page.
  redirect?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in — FlowERP AI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { login, loading } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await login({ email, password });
      toast.success("Signed in");
      const home = result.user.isPlatformAdmin ? "/platform" : "/app";
      navigate({ to: isSafeRedirect(redirect) ? redirect! : home, replace: true });
    } catch (err) {
      // Read the thrown error, not the hook's `error` state — that state has
      // not re-rendered yet at this point, so it was always the previous value
      // (null on the first failed attempt).
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  };

  return (
    <>
      <AuthShell
        title="Welcome back"
        subtitle="Sign in to your FlowERP workspace."
        footer={
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => openDemoModal("login")}
              className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Get started
            </button>
          </>
        }
      >
        {/* `method="post"` is belt and braces: if a browser ever performs a
            native submit here anyway, the credentials go in a request body
            rather than into the URL. */}
        <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
          {error && (
            <div key={error} className="auth-shake">
              <FormAlert message={error} />
            </div>
          )}

          <TextField
            id="email"
            label="Email"
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <PasswordField
            id="password"
            label="Password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            labelExtra={
              <Link
                to="/auth/forgot-password"
                className="rounded text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Forgot password?
              </Link>
            }
          />

          <SubmitButton loading={loading} loadingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      </AuthShell>
      <DemoModal />
    </>
  );
}
