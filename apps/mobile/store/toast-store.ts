import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

/** Routine, non-blocking feedback ("Queued — will sync when back online", "Status
 * updated") goes through here, not `Alert.alert` — a native alert demands a tap to
 * dismiss before the driver can do anything else, which is the right weight for
 * "sign out?" and the wrong weight for "synced." Errors that need the driver to
 * actually read and decide something (a conflict, a failed sign-in) still use
 * Alert/Dialog. */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (message, variant = 'default') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function showToast(message: string, variant: ToastVariant = 'default') {
  useToastStore.getState().show(message, variant);
}
