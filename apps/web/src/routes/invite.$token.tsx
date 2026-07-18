'use client';

import type { ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Building2, CalendarClock, Mail, Shield, UserRound } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { statusLabel } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/format';
import { useValidateInvitation, type ValidatedInvitation } from '@/lib/api/invitations';

export const Route = createFileRoute('/invite/$token')({
  head: () => ({
    meta: [
      { title: 'Accept your invitation — FlowERP AI' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  // Task 7.1's hook — no direct fetch here. The global QueryClient already
  // treats 4xx (invalid/expired/revoked/accepted) as non-retryable, and
  // unwrapResponse surfaces the server's own message via ApiError.
  const { data, isLoading, isError, error } = useValidateInvitation(token);

  return (
    <AuthShell
      title="You're invited"
      subtitle="Review the details below, then continue to join your team on FlowERP AI."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {isLoading ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <LoadingState label="Checking your invitation…" />
        </div>
      ) : isError || !data ? (
        // Invalid / expired / revoked / already accepted all arrive here as the
        // server's message — never a hardcoded HTTP code.
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : 'This invitation could not be loaded. It may be invalid or no longer available.'
          }
        />
      ) : (
        <InvitationPreview token={token} invitation={data} />
      )}
    </AuthShell>
  );
}

function InvitationPreview({ token, invitation }: { token: string; invitation: ValidatedInvitation }) {
  return (
    <div className="space-y-6">
      <dl className="space-y-4">
        <DetailRow icon={<Building2 className="h-4 w-4" />} label="Organization" value={invitation.organizationName} />
        <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={invitation.email} />
        <DetailRow icon={<Shield className="h-4 w-4" />} label="Role" value={statusLabel(invitation.role)} />
        {invitation.inviterDisplayName ? (
          <DetailRow
            icon={<UserRound className="h-4 w-4" />}
            label="Invited by"
            value={invitation.inviterDisplayName}
          />
        ) : null}
        <DetailRow
          icon={<CalendarClock className="h-4 w-4" />}
          label="Expires"
          value={formatDate(invitation.expiresAt)}
        />
      </dl>

      {/* Continues to the acceptance form (Task 7.3). Native anchor — that route
          is intentionally not built yet, so it is not a typed router target. */}
      <Button asChild className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
        <a href={`/invite/${token}/accept`}>Accept invitation</a>
      </Button>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 rounded-lg bg-brand/10 p-2 text-brand" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
