'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/components/shared/status-badge';
import type { CurrentUser } from '@/lib/api/auth';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function UserMenu({ currentUser, onSignOut }: { currentUser: CurrentUser | null; onSignOut: () => void }) {
  const navigate = useNavigate();
  // The sign-out item closes the menu on click, which would unmount an embedded
  // AlertDialogTrigger before the dialog opened — so the dialog is controlled
  // from here and rendered as a sibling of the menu.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const user = currentUser?.user;
  const name = user ? `${user.firstName} ${user.lastName}` : 'Loading...';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gradient-brand text-xs font-semibold text-brand-foreground">
              {initials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-foreground">{name}</span>
            <span className="block text-xs leading-tight text-muted-foreground">
              {currentUser?.organization.name ?? ''}
            </span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
            {currentUser?.membership.role && (
              <Badge variant="brand" className="mt-2">
                {statusLabel(currentUser.membership.role)}
              </Badge>
            )}
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => navigate({ to: '/app/settings' })} className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: '/app/settings' })} className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out of FlowERP?"
        description="You'll need to sign in again to get back to your organization's data."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={onSignOut}
        destructive
      />
    </>
  );
}
