'use client';

import { useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { AlertTriangle, Ban, CheckCircle2, Clock } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthStatusCard } from '@/components/auth/AuthStatusCard';
import { PasswordField } from '@/components/auth/PasswordField';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { Button } from '@/components/ui/button';

/**
 * UI-ONLY SCREEN — there is no reset-password API endpoint yet (see the
 * comment on ForgotPasswordPage). This route renders every visual state the
 * flow will need, but does not call, mock, or simulate a backend. Wiring
 * points are marked TODO(backend) below.
 */

const searchSchema = z.object({ token: z.string().catch('') });

export const Route = createFileRoute('/auth/reset-password')({
  head: () => ({
    meta: [
      { title: 'Reset Password — FlowERP AI' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

type FieldErrors = { password?: string; confirmPassword?: string };

function ResetPasswordPage() {
  // TODO(backend): once a reset-password API exists, validate `token` on
  // mount (e.g. useValidateResetToken(token)) and drive `view` from the
  // response instead — showing 'loading' while pending, then routing to
  // ResetPasswordExpiredView / ResetPasswordInvalidView / the form below,
  // and ResetPasswordSuccessView / ResetPasswordErrorView after submit.
  // Today the only real signal available client-side is whether a token is
  // present at all — an empty token can never be valid, so that case is
  // handled for real; a present token goes straight to the form.
  const { token } = Route.useSearch();
  const view: 'form' | 'invalid' = token ? 'form' : 'invalid';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (view === 'invalid') {
    return (
      <AuthShell title="Reset your password">
        <ResetPasswordInvalidView />
      </AuthShell>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: FieldErrors = {};
    if (!password) errors.password = 'Password is required';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters long';
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      (errors.password ? passwordRef : confirmRef).current?.focus();
      return;
    }

    // TODO(backend): this is where the real submission belongs, e.g.
    //   try {
    //     await resetPassword({ token, password });
    //     setView('success');
    //   } catch (err) {
    //     setFormError(err instanceof Error ? err.message : 'This link may have expired.');
    //   }
    // No endpoint exists yet, so submitting only performs the client-side
    // checks above — it intentionally does not fake a successful reset.
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you haven't used before."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <PasswordField
          id="password"
          ref={passwordRef}
          label="New password"
          required
          autoComplete="new-password"
          autoFocus
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={fieldErrors.password ? undefined : 'Use at least 8 characters.'}
          showStrength
        />

        <PasswordField
          id="confirmPassword"
          ref={confirmRef}
          label="Confirm new password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
        />

        <SubmitButton>Reset password</SubmitButton>
      </form>
    </AuthShell>
  );
}

/* --------------------------------------------------------------------
   Fully-designed states not yet reachable from the live flow above —
   there is no backend to trigger them from. Kept as complete, exported
   components so the visual design is finished and ready to wire in:
   drop a `setView('expired' | 'loading' | 'error')` call at the
   TODO(backend) points once the API exists.
   -------------------------------------------------------------------- */

function ResetPasswordInvalidView() {
  return (
    <AuthStatusCard
      icon={Ban}
      tone="destructive"
      title="Invalid reset link"
      description="This password reset link is missing or malformed. Request a new one to continue."
      action={
        <Button asChild className="h-11 w-full rounded-xl bg-gradient-brand text-brand-foreground hover:opacity-90">
          <Link to="/auth/forgot-password">Request a new link</Link>
        </Button>
      }
      secondary={
        <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      }
    />
  );
}

function ResetPasswordExpiredView() {
  return (
    <AuthStatusCard
      icon={Clock}
      tone="warning"
      title="This link has expired"
      description="Password reset links are only valid for a limited time. Request a new one to continue."
      action={
        <Button asChild className="h-11 w-full rounded-xl bg-gradient-brand text-brand-foreground hover:opacity-90">
          <Link to="/auth/forgot-password">Request a new link</Link>
        </Button>
      }
    />
  );
}

function ResetPasswordLoadingView() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <AuthStatusCard
        icon={Clock}
        spin
        tone="brand"
        title="Verifying your link…"
        description="Hold on while we confirm this reset link is still valid."
      />
    </div>
  );
}

function ResetPasswordSuccessView() {
  return (
    <AuthStatusCard
      icon={CheckCircle2}
      tone="success"
      title="Password updated"
      description="Your password has been changed. You can now sign in with your new password."
      action={
        <Button asChild className="h-11 w-full rounded-xl bg-gradient-brand text-brand-foreground hover:opacity-90">
          <Link to="/auth/sign-in">Go to Sign In</Link>
        </Button>
      }
    />
  );
}

function ResetPasswordErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <AuthStatusCard
      icon={AlertTriangle}
      tone="destructive"
      title="Something went wrong"
      description={message}
      action={
        onRetry ? (
          <Button onClick={onRetry} variant="outline" className="h-11 w-full rounded-xl">
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
