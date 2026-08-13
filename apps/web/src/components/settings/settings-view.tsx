import { useEffect, useMemo, useState } from 'react';
import { Building2, CreditCard, Image, Mail, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { CompanyBrandingSection } from './company-branding-section';
import { CompanyGeneralSection } from './company-general-section';
import { CompanyLegalSection } from './company-legal-section';
import { InvitationsSection } from './invitations-section';
import { MembersTab } from './members-tab';
import { ProfileTab } from './profile-tab';

type SectionId =
  | 'company-general'
  | 'company-legal'
  | 'company-branding'
  | 'team-members'
  | 'team-invitations'
  | 'personal-profile';

interface SectionDefinition {
  id: SectionId;
  label: string;
  group: 'Company' | 'Team' | 'Personal';
  icon: typeof Building2;
  /// Team management is ADMIN-only because every mutation behind it is; the
  /// Company sections render read-only for everyone else rather than hiding
  /// information a dispatcher may legitimately need to look up.
  adminOnly: boolean;
}

const SECTIONS: SectionDefinition[] = [
  { id: 'company-general', label: 'General', group: 'Company', icon: Building2, adminOnly: false },
  { id: 'company-legal', label: 'Legal & tax', group: 'Company', icon: CreditCard, adminOnly: false },
  { id: 'company-branding', label: 'Branding', group: 'Company', icon: Image, adminOnly: false },
  { id: 'team-members', label: 'Members', group: 'Team', icon: Users, adminOnly: true },
  { id: 'team-invitations', label: 'Invitations', group: 'Team', icon: Mail, adminOnly: true },
  { id: 'personal-profile', label: 'Your profile', group: 'Personal', icon: UserRound, adminOnly: false },
];

const GROUP_ORDER: SectionDefinition['group'][] = ['Company', 'Team', 'Personal'];

const GROUP_DESCRIPTIONS: Record<SectionDefinition['group'], string> = {
  Company: 'Shared settings for the whole organization',
  Team: 'Who has access, and with which role',
  Personal: 'Only affects your own account',
};

export function SettingsView() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const [activeSection, setActiveSection] = useState<SectionId>('company-general');

  useEffect(() => {
    refetch();
  }, [refetch]);

  const role = currentUser?.membership.role;
  const isAdmin = role === 'ADMIN';
  const isDriver = role === 'DRIVER';

  const sections = useMemo(
    () => SECTIONS.filter((section) => isAdmin || !section.adminOnly),
    [isAdmin],
  );

  /// A non-admin landing on a Team section (or a stale selection after a role
  /// change) would otherwise render nothing at all.
  useEffect(() => {
    if (!sections.some((section) => section.id === activeSection)) {
      setActiveSection('company-general');
    }
  }, [sections, activeSection]);

  if (loading) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  if (error || !currentUser) {
    return (
      <div role="alert" className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error || 'Failed to load your account'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  /// A driver has no company administration surface at all — no company fields,
  /// no team management — so the nav would be a single item. Show the profile
  /// directly instead of a menu with one entry.
  if (isDriver) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-bold text-foreground">Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your profile for the driver portal</p>
        </header>
        <ProfileTab />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Company details that appear on your documents, who can access this workspace, and your own
          preferences.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SettingsNav
          sections={sections}
          activeSection={activeSection}
          onSelect={setActiveSection}
        />
        <div className="min-w-0">
          {activeSection === 'company-general' && <CompanyGeneralSection isAdmin={isAdmin} />}
          {activeSection === 'company-legal' && <CompanyLegalSection isAdmin={isAdmin} />}
          {activeSection === 'company-branding' && <CompanyBrandingSection isAdmin={isAdmin} />}
          {activeSection === 'team-members' && <MembersTab />}
          {activeSection === 'team-invitations' && <InvitationsSection />}
          {activeSection === 'personal-profile' && <ProfileTab />}
        </div>
      </div>
    </div>
  );
}

/// Grouped list on desktop; on narrow screens the same items become one
/// horizontally scrollable row, which keeps every section reachable without a
/// menu that hides where you currently are.
function SettingsNav({
  sections,
  activeSection,
  onSelect,
}: {
  sections: SectionDefinition[];
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-4">
      <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {sections.map((section) => (
          <SettingsNavButton
            key={section.id}
            section={section}
            isActive={section.id === activeSection}
            onSelect={onSelect}
            className="shrink-0"
          />
        ))}
      </div>

      <div className="hidden lg:grid lg:gap-6">
        {GROUP_ORDER.map((group) => {
          const groupSections = sections.filter((section) => section.group === group);
          if (groupSections.length === 0) return null;

          return (
            <div key={group} className="grid gap-1.5">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              <p className="px-2 pb-1 text-xs text-muted-foreground/80">
                {GROUP_DESCRIPTIONS[group]}
              </p>
              {groupSections.map((section) => (
                <SettingsNavButton
                  key={section.id}
                  section={section}
                  isActive={section.id === activeSection}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function SettingsNavButton({
  section,
  isActive,
  onSelect,
  className,
}: {
  section: SectionDefinition;
  isActive: boolean;
  onSelect: (id: SectionId) => void;
  className?: string;
}) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-brand/10 text-brand'
          : 'text-muted-foreground hover:bg-surface hover:text-foreground',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{section.label}</span>
    </button>
  );
}
