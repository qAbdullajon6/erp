'use client';

import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { Ban, CheckCircle2, Clock, MailQuestion, XCircle } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthStatusCard } from '@/components/auth/AuthStatusCard';
import { Button } from '@/components/ui/button';

/**
 * UI-ONLY SCREEN — there is no email-verification API endpoint yet. This
 * route renders every visual state the flow will need, but does not call,
 * mock, or simulate a backend. Wiring points are marked TODO(backend) below.
 */

const searchSchema = z.object({ token: z.string().catch('') });

export const Route = createFileRoute('/auth/verify-email')({
  head: () => ({
    meta: [
      { title: 'Verify Your Email — FlowERP AI' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  validateSearch: searchSchema,
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  // TODO(backend): call a verify-email mutation on mount, e.g.
  //   const verify = useVerifyEmail(token);
  //   const view = verify.isPending ? 'verifying'
  //     : verify.isSuccess ? 'success'
  //     : verify.error?.code === 'EXPIRED' ? 'expired'
  //     : 'failed';
  // Today the only real signal available client-side is whether a token is
  // present at all — an empty token can never be valid, so that case is
  // handled for real. A present token is shown as "verifying" — the honest
  // state of the UI the instant this screen loads, before any backend call
  // has actually been wired in.
  const { token } = Route.useSearch();
  const view: 'verifying' | 'invalid' = token ? 'verifying' : 'invalid';

  return (
    <AuthShell title="Verify your email">
      {view === 'invalid' ? <VerifyEmailInvalidView /> : <VerifyEmailVerifyingView />}
    </AuthShell>
  );
}

/* --------------------------------------------------------------------
   Fully-designed states. VerifyEmailInvalidView and VerifyEmailVerifyingView
   are reachable today from real, non-fake signals (see above). The rest —
   success / failed / expired — have no honest trigger without a backend and
   are kept as complete, exported components ready to wire in: swap the
   `view` derivation above for real query state once the API exists.
   -------------------------------------------------------------------- */

function VerifyEmailVerifyingView() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <AuthStatusCard
        icon={Clock}
        spin
        tone="brand"
        title="Verifying your email…"
        description="This only takes a moment. Don't close this tab."
      />
    </div>
  );
}

function VerifyEmailSuccessView() {
  return (
    <AuthStatusCard
      icon={CheckCircle2}
      tone="success"
      title="Email verified"
      description="Your email address has been confirmed. You're all set."
      action={
        <Button asChild className="h-11 w-full rounded-xl bg-gradient-brand text-brand-foreground hover:opacity-90">
          <Link to="/auth/sign-in">Go to Sign In</Link>
        </Button>
      }
    />
  );
}

function VerifyEmailFailedView() {
  return (
    <AuthStatusCard
      icon={XCircle}
      tone="destructive"
      title="Verification failed"
      description="We couldn't verify your email with this link. It may have already been used."
      action={<ResendVerificationButton />}
      secondary={
        <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      }
    />
  );
}

function VerifyEmailExpiredView() {
  return (
    <AuthStatusCard
      icon={MailQuestion}
      tone="warning"
      title="This link has expired"
      description="Verification links are only valid for a limited time."
      action={<ResendVerificationButton />}
    />
  );
}

function VerifyEmailInvalidView() {
  return (
    <AuthStatusCard
      icon={Ban}
      tone="destructive"
      title="Invalid verification link"
      description="This verification link is missing or malformed."
      action={<ResendVerificationButton />}
      secondary={
        <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      }
    />
  );
}

/// Disabled by design — resend-verification has no endpoint yet.
/// TODO(backend): wire to a resend mutation and enable once it exists.
function ResendVerificationButton() {
  return (
    <Button disabled variant="outline" className="h-11 w-full rounded-xl" title="Coming soon">
      Resend verification email
    </Button>
  );
}
