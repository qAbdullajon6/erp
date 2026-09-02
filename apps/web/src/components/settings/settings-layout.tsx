import { useEffect, useMemo } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/list-states';
import { PageHeader } from '@/components/shared/page-header';
import { useCurrentUser } from '@/lib/api/auth';
import { getNavForRole } from '@/components/layout/nav-config';
import type { MembershipRole } from '@/lib/api/organizations';
import { cn } from '@/lib/utils';
import type { SettingsTab } from '@/routes/app.settings';

export interface SectionDefinition {
  id: SettingsTab | string;
  label: string;
  group: 'Company' | 'Personal';
  icon: typeof Building2;
  adminOnly: boolean;
  path?: string;
}

export const SECTIONS: SectionDefinition[] = [
  { id: 'general', label: 'General', group: 'Company', icon: Building2, adminOnly: false },
  { id: 'identity', label: 'Company identity', group: 'Company', icon: FileText, adminOnly: false },
  { id: 'members', label: 'Members', group: 'Company', icon: Users, adminOnly: true },
  { id: 'profile', label: 'Your profile', group: 'Personal', icon: UserRound, adminOnly: false },
];

export const GROUP_ORDER: SectionDefinition['group'][] = ['Company', 'Personal'];

export const GROUP_DESCRIPTIONS: Record<SectionDefinition['group'], string> = {
  Company: 'Shared by everyone in this workspace',
  Personal: 'Only affects your own account',
};

export const WORKSPACE_ICONS: Record<string, typeof Building2> = {
  '/app/billing': CreditCard,
  '/app/notifications': Bell,
  '/app/import': Upload,
  '/app/workflows': Workflow,
  '/app/developer': Terminal,
  '/app/audit-logs': History,
};

export function SettingsLayout({
  children,
  activeSection,
  onSelectSection,
  title = "Settings",
  subtitle = "Company details that appear on your documents, who can access this workspace, and your own preferences."
}: {
  children: React.ReactNode;
  activeSection?: string;
  onSelectSection?: (id: SettingsTab | string) => void;
  title?: string;
  subtitle?: string;
}) {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const location = useLocation();

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

  if (loading || error || !currentUser) {
    return (
      <div className="space-y-8">
        <PageHeader title={title} subtitle={subtitle} />
        {loading ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <ErrorState
            message={error || 'Failed to load your account'}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  if (isDriver) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={subtitle} />
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SettingsNav
          sections={sections}
          activeSection={activeSection}
          onSelect={onSelectSection}
          workspaceLinks={workspaceLinks}
          currentPath={location.pathname}
        />
        <div className="min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}

function SettingsNav({
  sections,
  activeSection,
  onSelect,
  workspaceLinks,
  currentPath,
}: {
  sections: SectionDefinition[];
  activeSection?: string;
  onSelect?: (id: SettingsTab | string) => void;
  workspaceLinks: { label: string; path: string }[];
  currentPath: string;
}) {
  return (
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
          <WorkspaceNavLink key={link.path} link={link} className="shrink-0" currentPath={currentPath} />
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
              <WorkspaceNavLink key={link.path} link={link} currentPath={currentPath} />
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
  currentPath,
}: {
  link: { label: string; path: string };
  className?: string;
  currentPath: string;
}) {
  const Icon = WORKSPACE_ICONS[link.path] ?? Building2;
  const isActive = currentPath.startsWith(link.path);

  return (
    <Link
      to={link.path}
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
  onSelect?: (id: SettingsTab | string) => void;
  className?: string;
}) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => {
        if (onSelect) onSelect(section.id);
      }}
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
