import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthStatusCard } from "@/components/auth/AuthStatusCard";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { FormError } from "@/components/shared/form-field";
import { authAPI } from "@/lib/api/auth";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — FlowERP AI" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request a reset link");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <AuthShell title="Check your email">
        <AuthStatusCard
          icon={MailCheck}
          tone="success"
          title="Request received"
          description="If an eligible FlowERP account exists for that address, a one-time reset link has been sent."
          secondary={
            <Link to="/login" className="font-medium text-brand hover:underline">
              Back to sign in
            </Link>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send a one-time reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}
        {/* `TextField`, not the in-app `FormField`: this screen sits next to
            sign-in, and the two were rendering different field heights and a
            required asterisk on one but not the other. */}
        <TextField
          id="email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          disabled={loading}
        />
        <SubmitButton loading={loading} loadingLabel="Sending…">
          Send reset link
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
