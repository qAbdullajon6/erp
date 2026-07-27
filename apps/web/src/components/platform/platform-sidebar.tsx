import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { LogoMark, Wordmark } from '@/components/brand/Logo';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  PLATFORM_NAV,
  isPlatformNavPathActive,
} from '@/components/platform/platform-nav';
import { cn } from '@/lib/utils';

export function PlatformSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          to="/platform"
          className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center"
        >
          <LogoMark size={28} />
          <span className="group-data-[collapsible=icon]:hidden">
            <Wordmark />
          </span>
        </Link>
        <p className="px-2 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          Platform Console
        </p>
      </SidebarHeader>
      <SidebarContent className="scrollbar-thin gap-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
            Console
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_NAV.map((item) => {
                const active = isPlatformNavPathActive(location.pathname, item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      onClick={() => navigate({ to: item.path as any })}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative transition-colors duration-150 hover:bg-sidebar-accent/70',
                        'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
                        'before:absolute before:left-0 before:top-1/2 before:h-0 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-sidebar-primary before:transition-all before:duration-200',
                        'data-[active=true]:bg-sidebar-primary/15 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-primary)] data-[active=true]:before:h-5 data-[active=true]:hover:bg-sidebar-primary/20',
                        '[&>svg]:transition-colors [&>svg]:duration-150 data-[active=true]:[&>svg]:text-sidebar-primary',
                      )}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                      {active ? <span className="sr-only">(current page)</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
