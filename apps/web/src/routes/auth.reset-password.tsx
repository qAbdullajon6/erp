'use client';

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { AlertTriangle, Ban, CheckCircle2, Clock } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthStatusCard } from '@/components/auth/AuthStatusCard';
import { PasswordField } from '@/components/auth/PasswordField';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { Button } from '@/components/ui/button';
import { authAPI } from '@/lib/api/auth';

const searchSchema = z.object({ token: z.string().catch('') });

export const Route = createFileRoute('/auth/reset-password')({
  head: () => ({
    meta: [
      { title: 'Reset Password — FlowERP AI' },
      { name: 'robots', content: 'noindex' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

type FieldErrors = { password?: string; confirmPassword?: string };

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [view, setView] = useState<'loading' | 'form' | 'invalid' | 'success' | 'error'>(
    token ? 'loading' : 'invalid',
  );
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    // Keep the capability in component memory only after first render so it
    // does not remain in browser history or leak through a copied URL.
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', cleanUrl.toString());
    authAPI
      .validateResetToken(token)
      .then(() => {
        if (active) setView('form');
      })
      .catch(() => {
        if (active) setView('invalid');
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (view === 'loading') {
    return (
      <AuthShell title="Reset your password">
        <ResetPasswordLoadingView />
      </AuthShell>
    );
  }
  if (view === 'invalid') {
    return (
      <AuthShell title="Reset your password">
        <ResetPasswordInvalidView />
      </AuthShell>
    );
  }
  if (view === 'success') {
    return (
      <AuthShell title="Password updated">
        <ResetPasswordSuccessView />
      </AuthShell>
    );
  }
  if (view === 'error') {
    return (
      <AuthShell title="Reset your password">
        <ResetPasswordErrorView message={formError} onRetry={() => setView('form')} />
      </AuthShell>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
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

    setSubmitting(true);
    try {
      await authAPI.resetPassword(token, password);
      setView('success');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'This link may have expired.');
      setView('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you haven't used before."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
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

        <SubmitButton loading={submitting}>Reset password</SubmitButton>
      </form>
    </AuthShell>
  );
}

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
        <Link to="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
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
          <Link to="/login">Go to Sign In</Link>
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
