'use client';

import { useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/shared/form-alert';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
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
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Success: no login, no JWT, no auto-redirect — just tell them how to sign in.
  if (succeeded) {
    return (
      <AuthShell
        title="Invitation accepted"
        subtitle="Your account is ready to use."
      >
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4">
            <span className="mt-0.5 shrink-0 rounded-lg bg-brand/10 p-2 text-brand" aria-hidden="true">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <p className="font-medium text-foreground">Invitation accepted successfully.</p>
              <p className="mt-1 text-muted-foreground">
                You can now sign in using your email and the password you just set.
              </p>
            </div>
          </div>
          <Button asChild className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
            <Link to="/auth/sign-in">Go to Sign In</Link>
          </Button>
        </div>
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
    <AuthShell
      title="Join your team"
      subtitle="Set your name and a password to accept the invitation."
    >
      {validation.isLoading ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <LoadingState label="Checking your invitation…" />
        </div>
      ) : validation.isError || !validation.data ? (
        <ErrorState
          message={
            validation.error instanceof Error
              ? validation.error.message
              : 'This invitation could not be loaded. It may be invalid or no longer available.'
          }
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && <FormAlert message={formError} />}

          {/* Email is fixed by the invitation — shown, never editable. */}
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Work Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={validation.data.email}
              readOnly
              disabled
              autoComplete="email"
              className="h-11 bg-background/40"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              ref={firstNameRef}
              autoFocus
              required
              autoComplete="given-name"
              className="h-11 bg-background/40"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={accept.isPending}
              aria-invalid={fieldErrors.firstName ? true : undefined}
              aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
            />
            {fieldErrors.firstName && (
              <p id="firstName-error" className="text-sm text-destructive">
                {fieldErrors.firstName}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              ref={lastNameRef}
              required
              autoComplete="family-name"
              className="h-11 bg-background/40"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={accept.isPending}
              aria-invalid={fieldErrors.lastName ? true : undefined}
              aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
            />
            {fieldErrors.lastName && (
              <p id="lastName-error" className="text-sm text-destructive">
                {fieldErrors.lastName}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="h-11 bg-background/40 pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={accept.isPending}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? 'password-error password-hint' : 'password-hint'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p id="password-hint" className="text-xs text-muted-foreground">
              Use at least 8 characters.
            </p>
            {fieldErrors.password && (
              <p id="password-error" className="text-sm text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={accept.isPending}
            className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            {accept.isPending ? 'Accepting…' : 'Accept invitation'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
