import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/list-states';

/// One visual shell for every settings section so Company, Team and Personal
/// all read the same way: title, one line explaining what the section is for,
/// then content.
export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/// Save/Discard pair shared by the Company forms. Both stay disabled until
/// something actually changed, so "Save" never implies a write that would be a
/// no-op, and the save button reports progress instead of going dead.
export function SettingsFormActions({
  isDirty,
  isSaving,
  onReset,
}: {
  isDirty: boolean;
  isSaving: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-brand/10 pt-4">
      <Button type="submit" size="sm" disabled={!isDirty || isSaving}>
        {isSaving ? 'Saving…' : 'Save changes'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onReset}
        disabled={!isDirty || isSaving}
      >
        Discard
      </Button>
      {isDirty && !isSaving && (
        <span className="text-xs text-muted-foreground" role="status">
          Unsaved changes
        </span>
      )}
    </div>
  );
}

export function SettingsFormError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  );
}

export function SettingsSectionSkeleton() {
  return <Skeleton className="h-72 rounded-xl" />;
}

export function SettingsSectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return <ErrorState message={message} onRetry={onRetry} />;
}
