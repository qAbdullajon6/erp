'use client';

import type { ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Building2, CalendarClock, Mail, Shield, UserRound } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthStatusCard } from '@/components/auth/AuthStatusCard';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/site/landing/primitives';
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
          <AuthStatusCard icon={AlertCircle} spin tone="brand" title="Checking your invitation…" />
        </div>
      ) : isError || !data ? (
        // Invalid / expired / revoked / already accepted all arrive here as the
        // server's message — never a hardcoded HTTP code.
        <AuthStatusCard
          icon={AlertCircle}
          tone="destructive"
          title="This invitation isn't available"
          description={
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
      <Button
        asChild
        className="h-11 w-full rounded-xl bg-gradient-brand text-[15px] font-semibold text-brand-foreground transition-all duration-200 hover:opacity-90 hover:shadow-brand active:scale-[0.99]"
      >
        <a href={`/invite/${token}/accept`}>Accept invitation</a>
      </Button>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <IconTile size="sm" className="shrink-0">
        {icon}
      </IconTile>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
