'use client';

import { useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthStatusCard } from '@/components/auth/AuthStatusCard';
import { TextField } from '@/components/auth/TextField';
import { PasswordField } from '@/components/auth/PasswordField';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/shared/form-alert';
import { useAcceptInvitation, useValidateInvitation } from '@/lib/api/invitations';

/// The trailing underscore (`invite.$token_.accept.tsx`) un-nests this from the
/// `/invite/$token` preview route. Without it TanStack treats this as a *child*
/// of the preview, whose component renders the preview UI and has no <Outlet /> —
/// so this form never mounted and /invite/$token/accept was silently unreachable.
/// The URL is unchanged; only the nesting is.
export const Route = createFileRoute('/invite/$token_/accept')({
  head: () => ({
    meta: [
      { title: 'Accept your invitation — FlowERP AI' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AcceptInvitationPage,
});

type FieldErrors = { firstName?: string; lastName?: string; password?: string };

function AcceptInvitationPage() {
  // The token comes only from the route — it is never a form field.
  const { token } = Route.useParams();

  // Validate before showing the form (reuses Task 7.1's hook); invalid /
  // expired / revoked / already-accepted all arrive here as ApiError messages.
  const validation = useValidateInvitation(token);
  const accept = useAcceptInvitation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Success: no login, no JWT, no auto-redirect — just tell them how to sign in.
  if (succeeded) {
    return (
      <AuthShell title="Invitation accepted" subtitle="Your account is ready to use.">
        <AuthStatusCard
          icon={CheckCircle2}
          tone="success"
          title="You're all set"
          description="You can now sign in using your email and the password you just set."
          action={
            <Button asChild className="h-11 w-full rounded-xl bg-gradient-brand text-brand-foreground hover:opacity-90">
              <Link to="/auth/sign-in">Go to Sign In</Link>
            </Button>
          }
        />
      </AuthShell>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accept.isPending) return; // prevent double submission

    setFormError(null);

    // Client-side only checks that the fields are present; the password policy
    // (length) is owned by the backend and surfaces via ApiError, so it is not
    // duplicated here.
    const errors: FieldErrors = {};
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      (errors.firstName ? firstNameRef : errors.lastName ? lastNameRef : passwordRef).current?.focus();
      return;
    }

    try {
      await accept.mutateAsync({
        token,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      setSucceeded(true);
    } catch (err) {
      // invalid / expired / revoked / already accepted / membership conflict —
      // whatever the server said, verbatim. No HTTP code checks.
      setFormError(err instanceof Error ? err.message : 'The invitation could not be accepted.');
    }
  };

  return (
    <AuthShell title="Join your team" subtitle="Set your name and a password to accept the invitation.">
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

          {/* Email is fixed by the invitation — shown, never editable. */}
          <TextField
            id="invite-email"
            label="Work Email"
            type="email"
            value={validation.data.email}
            readOnly
            disabled
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              id="firstName"
              ref={firstNameRef}
              label="First name"
              autoFocus
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={accept.isPending}
              error={fieldErrors.firstName}
            />

            <TextField
              id="lastName"
              ref={lastNameRef}
              label="Last name"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={accept.isPending}
              error={fieldErrors.lastName}
            />
          </div>

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

          <SubmitButton loading={accept.isPending} loadingLabel="Accepting…">
            Accept invitation
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
