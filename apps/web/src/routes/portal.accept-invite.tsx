'use client';

import { useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthStatusCard } from '@/components/auth/AuthStatusCard';
import { TextField } from '@/components/auth/TextField';
import { PasswordField } from '@/components/auth/PasswordField';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/shared/form-alert';
import {
  useAcceptCustomerPortalInvitation,
  useValidateCustomerPortalInvitation,
} from '@/lib/api/customer-portal-invitations';

const searchSchema = z.object({ token: z.string().catch('') });

export const Route = createFileRoute('/portal/accept-invite')({
  head: () => ({
    meta: [
      { title: 'Activate Your Account — Customer Portal' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  validateSearch: searchSchema,
  component: AcceptPortalInvitationPage,
});

type FieldErrors = { password?: string; confirmPassword?: string };

function AcceptPortalInvitationPage() {
  // The token comes only from the URL — it is never a form field.
  const { token } = Route.useSearch();

  const validation = useValidateCustomerPortalInvitation(token);
  const accept = useAcceptCustomerPortalInvitation();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (!token) {
    return (
      <AuthShell title="Activate your account">
        <AuthStatusCard
          icon={AlertCircle}
          tone="destructive"
          title="This link is missing its token"
          description="Please use the activation link from your invitation email."
        />
      </AuthShell>
    );
  }

  if (succeeded) {
    return (
      <AuthShell title="Account activated" subtitle="Your account is ready to use.">
        <AuthStatusCard
          icon={CheckCircle2}
          tone="success"
          title="You're all set"
          description="You can now sign in using your email and the password you just set."
          action={
            <Button asChild className="h-11 w-full rounded-xl bg-gradient-brand text-brand-foreground hover:opacity-90">
              <Link to="/portal/login">Go to Sign In</Link>
            </Button>
          }
        />
      </AuthShell>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accept.isPending) return;

    setFormError(null);

    const errors: FieldErrors = {};
    if (!password) errors.password = 'Password is required';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters long';
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      (errors.password ? passwordRef : confirmRef).current?.focus();
      return;
    }

    try {
      await accept.mutateAsync({ token, password });
      setSucceeded(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'This invitation could not be accepted.');
    }
  };

  return (
    <AuthShell title="Activate your account" subtitle="Set a password to get started.">
      {validation.isLoading ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <AuthStatusCard icon={AlertCircle} spin tone="brand" title="Checking your invitation…" />
        </div>
      ) : validation.isError || !validation.data ? (
        <AuthStatusCard
          icon={AlertCircle}
          tone="destructive"
          title="This invitation isn't available"
          description={
            validation.error instanceof Error
              ? validation.error.message
              : 'This invitation could not be loaded. It may be invalid or no longer available.'
          }
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && (
            <div key={formError} className="auth-shake">
              <FormAlert message={formError} />
            </div>
          )}

          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{validation.data.customerCompanyName}</span> has been
            invited to the {validation.data.organizationName} customer portal.
          </p>

          <TextField
            id="invite-email"
            label="Email"
            type="email"
            value={validation.data.email}
            readOnly
            disabled
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
          />

          <PasswordField
            id="password"
            ref={passwordRef}
            label="Password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={accept.isPending}
            error={fieldErrors.password}
            hint={fieldErrors.password ? undefined : 'Use at least 8 characters.'}
            showStrength
          />

          <PasswordField
            id="confirmPassword"
            ref={confirmRef}
            label="Confirm password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={accept.isPending}
            error={fieldErrors.confirmPassword}
          />

          <SubmitButton loading={accept.isPending} loadingLabel="Activating…">
            Activate account
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
