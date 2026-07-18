'use client';

import { useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
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
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="relative min-h-screen bg-background">
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
              <Truck className="h-6 w-6 text-brand" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Customer Portal</h1>
            <p className="mt-2 text-sm text-muted-foreground">Activate your account to get started.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-surface/80 p-8 shadow-elevated backdrop-blur">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  if (!token) {
    return (
      <Shell>
        <ErrorState message="This activation link is missing its token. Please use the link from your invitation email." />
      </Shell>
    );
  }

  if (succeeded) {
    return (
      <Shell>
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4">
            <span className="mt-0.5 shrink-0 rounded-lg bg-brand/10 p-2 text-brand" aria-hidden="true">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <p className="font-medium text-foreground">Account activated successfully.</p>
              <p className="mt-1 text-muted-foreground">
                You can now sign in using your email and the password you just set.
              </p>
            </div>
          </div>
          <Button asChild className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
            <Link to="/portal/login">Go to Sign In</Link>
          </Button>
        </div>
      </Shell>
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
    <Shell>
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
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{validation.data.customerCompanyName}</span> has been
            invited to the {validation.data.organizationName} customer portal.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
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

          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              ref={confirmRef}
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className="h-11 bg-background/40"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={accept.isPending}
              aria-invalid={fieldErrors.confirmPassword ? true : undefined}
            />
            {fieldErrors.confirmPassword && (
              <p className="text-sm text-destructive">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={accept.isPending}
            className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            {accept.isPending ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
      )}
    </Shell>
  );
}
