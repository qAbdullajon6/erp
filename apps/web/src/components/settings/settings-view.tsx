import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  Bell,
  Building2,
  CreditCard,
  FileText,
  History,
  Terminal,
  Upload,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/api/auth';
import { getNavForRole } from '@/components/layout/nav-config';
import type { MembershipRole } from '@/lib/api/organizations';
import { cn } from '@/lib/utils';
import type { SettingsTab } from '@/routes/app.settings';
import { CompanyGeneralSection } from './company-general-section';
import { CompanyIdentitySection } from './company-identity-section';
import { MembersSection } from './members-section';
import { ProfileTab } from './profile-tab';

interface SectionDefinition {
  id: SettingsTab;
  label: string;
  group: 'Company' | 'Personal';
  icon: typeof Building2;
  /// Member management is ADMIN-only because every mutation behind it is; the
  /// Company sections render read-only for everyone else rather than hiding
  /// information a dispatcher may legitimately need to look up.
  adminOnly: boolean;
}

const SECTIONS: SectionDefinition[] = [
  { id: 'general', label: 'General', group: 'Company', icon: Building2, adminOnly: false },
  { id: 'identity', label: 'Company identity', group: 'Company', icon: FileText, adminOnly: false },
  { id: 'members', label: 'Members', group: 'Company', icon: Users, adminOnly: true },
  { id: 'profile', label: 'Your profile', group: 'Personal', icon: UserRound, adminOnly: false },
];

const GROUP_ORDER: SectionDefinition['group'][] = ['Company', 'Personal'];

const GROUP_DESCRIPTIONS: Record<SectionDefinition['group'], string> = {
  Company: 'Shared by everyone in this workspace',
  Personal: 'Only affects your own account',
};

/// Billing, Notifications, Data import, Automation, Developer and Activity log
/// are configuration too, but they are full screens of their own rather than
/// sections of this one. They were only listed under Settings in the app
/// sidebar, so an admin who opened Settings looking for notification
/// preferences found a menu that did not mention them. They are listed here as
/// links to where they actually live.
const WORKSPACE_ICONS: Record<string, typeof Building2> = {
  '/app/billing': CreditCard,
  '/app/notifications': Bell,
  '/app/import': Upload,
  '/app/workflows': Workflow,
  '/app/developer': Terminal,
  '/app/audit-logs': History,
};

export function SettingsView() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const navigate = useNavigate({ from: '/app/settings' });
  const search = useSearch({ from: '/app/settings' });

  /// The session payload is cached across the whole app; a role change made
  /// elsewhere should be reflected on the screen that acts on roles.
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

  const isPlatformAdmin = Boolean(currentUser?.user.isPlatformAdmin);
  const workspaceLinks = useMemo(() => {
    if (!role) return [];
    const settingsItem = getNavForRole(role as MembershipRole, isPlatformAdmin).find(
      (item) => item.path === '/app/settings',
    );
    return settingsItem?.children ?? [];
  }, [role, isPlatformAdmin]);

  /// A non-admin who follows a link to ?tab=members — or keeps a bookmark from
  /// before their role changed — would otherwise land on a section that renders
  /// nothing at all.
  const requested = search.tab;
  const activeSection: SettingsTab = sections.some((section) => section.id === requested)
    ? (requested as SettingsTab)
    : 'general';

  const selectSection = (id: SettingsTab) => {
    void navigate({
      to: '/app/settings',
      search: () => (id === 'general' ? {} : { tab: id }),
    });
  };

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
  /// no member management — so the nav would be a single item. Show the profile
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
          onSelect={selectSection}
          workspaceLinks={workspaceLinks}
        />
        <div className="min-w-0">
          {activeSection === 'general' && <CompanyGeneralSection isAdmin={isAdmin} />}
          {activeSection === 'identity' && <CompanyIdentitySection isAdmin={isAdmin} />}
          {activeSection === 'members' && <MembersSection />}
          {activeSection === 'profile' && <ProfileTab />}
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
  workspaceLinks,
}: {
  sections: SectionDefinition[];
  activeSection: SettingsTab;
  onSelect: (id: SettingsTab) => void;
  workspaceLinks: { label: string; path: string }[];
}) {
  return (
    // A grid item refuses to shrink below its content, so without min-w-0 the
    // phone tab strip widens the whole column and the page scrolls sideways
    // instead of the strip scrolling inside it.
    <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-4">
      <div className="scroll-hint-x flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {sections.map((section) => (
          <SettingsNavButton
            key={section.id}
            section={section}
            isActive={section.id === activeSection}
            onSelect={onSelect}
            className="shrink-0"
          />
        ))}
        {workspaceLinks.map((link) => (
          <WorkspaceNavLink key={link.path} link={link} className="shrink-0" />
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

        {workspaceLinks.length > 0 && (
          <div className="grid gap-1.5">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <p className="px-2 pb-1 text-xs text-muted-foreground/80">
              Configured on their own screens
            </p>
            {workspaceLinks.map((link) => (
              <WorkspaceNavLink key={link.path} link={link} />
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

function WorkspaceNavLink({
  link,
  className,
}: {
  link: { label: string; path: string };
  className?: string;
}) {
  const Icon = WORKSPACE_ICONS[link.path] ?? Building2;

  return (
    <Link
      to={link.path}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
        'text-muted-foreground hover:bg-surface hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{link.label}</span>
    </Link>
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
  onSelect: (id: SettingsTab) => void;
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
