import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCurrentUser } from '@/lib/api/auth';
import type { SettingsTab } from '@/routes/app.settings';
import { CompanyGeneralSection } from './company-general-section';
import { CompanyIdentitySection } from './company-identity-section';
import { MembersSection } from './members-section';
import { ProfileTab } from './profile-tab';
import { SettingsLayout } from './settings-layout';

export function SettingsView() {
  const { data: currentUser } = useCurrentUser();
  const navigate = useNavigate({ from: '/app/settings' });
  const search = useSearch({ from: '/app/settings' });

  const role = currentUser?.membership.role;
  const isAdmin = role === 'ADMIN';

  /// A non-admin who follows a link to ?tab=members — or keeps a bookmark from
  /// before their role changed — would otherwise land on a section that renders
  /// nothing at all.
  const requested = search.tab;
  const activeSection: SettingsTab =
    requested === 'members' && !isAdmin
      ? 'general'
      : (requested as SettingsTab) || 'general';

  const selectSection = (id: SettingsTab | string) => {
    void navigate({
      to: '/app/settings',
      search: () => (id === 'general' ? {} : { tab: id as SettingsTab }),
    });
  };

  return (
    <SettingsLayout
      activeSection={activeSection}
      onSelectSection={selectSection}
    >
      {activeSection === 'general' && <CompanyGeneralSection isAdmin={isAdmin} />}
      {activeSection === 'identity' && <CompanyIdentitySection isAdmin={isAdmin} />}
      {activeSection === 'members' && <MembersSection />}
      {activeSection === 'profile' && <ProfileTab />}
    </SettingsLayout>
  );
}
