import { InviteMemberDialog } from './invite-member-dialog';
import { PendingInvitations } from './pending-invitations';
import { SettingsSection } from './settings-section';

/// Invitations used to be appended below the member table, which made an
/// invited-but-not-yet-joined person look like a second class of member. They
/// are a different thing with a different lifecycle (resend, revoke, expire), so
/// they get their own section.
export function InvitationsSection() {
  return (
    <SettingsSection
      title="Invitations"
      description="People invited to join who have not accepted yet. An invitation expires on its own if it is never used."
      actions={<InviteMemberDialog />}
    >
      <PendingInvitations />
    </SettingsSection>
  );
}
