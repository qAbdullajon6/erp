'use client';

import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/// Replaces window.confirm() for destructive actions. Native dialogs block the
/// event loop (and any browser automation driving the page), and they cannot
/// be styled to match the rest of the app.
///
/// Pass `trigger` for the common case. Pass `open`/`onOpenChange` instead when
/// the dialog is opened from something that unmounts on click — a dropdown menu
/// item, for instance, closes the menu and would take an embedded trigger with
/// it before the dialog ever mounted.
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  /// Extra content between the description and the actions — e.g. an
  /// optional-reason textarea for a cancellation.
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /// Explicit Stay/Cancel handler (controlled dialogs only; not fired on Confirm).
  onCancel?: () => void;
  destructive?: boolean;
}) {
  const controlled = typeof open === 'boolean';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent
        // Controlled dialogs are commonly opened from something that already
        // unmounted (a dropdown menu item) — Radix's default focus-return has
        // no live trigger to land on there, so it's skipped. Uncontrolled
        // dialogs (an AlertDialogTrigger wrapping a real, still-mounted
        // button) keep the default: focus correctly returns to it on close.
        onCloseAutoFocus={(e) => {
          if (controlled) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (controlled) e.stopPropagation();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={(e) => {
              if (!controlled) {
                onCancel?.();
                return;
              }
              // Controlled + nested Sheet: prevent Radix from dismissing the parent.
              e.preventDefault();
              e.stopPropagation();
              onCancel?.();
              onOpenChange?.(false);
            }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              if (controlled) {
                e.preventDefault();
                e.stopPropagation();
              }
              onConfirm();
            }}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
