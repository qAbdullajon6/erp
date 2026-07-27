import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, CircleAlert, Info } from 'lucide-react-native';
import Animated, { FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';
import { useToastStore, type Toast as ToastItem, type ToastVariant } from '@/store/toast-store';
import { colors } from '@/theme/tokens';
import { cn } from '@/lib/utils';

const AUTO_DISMISS_MS = 3200;

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2 | null> = {
  default: null,
  info: Info,
  success: CheckCircle2,
  error: CircleAlert,
};

const VARIANT_ICON_COLOR: Record<ToastVariant, string> = {
  default: colors.foreground,
  info: colors.primary,
  success: colors.success,
  error: colors.destructive,
};

function ToastRow({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  const Icon = VARIANT_ICON[toast.variant];

  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutDown.duration(180)} layout={Layout}>
      <View
        className={cn(
          'mb-2 flex-row items-center gap-2 rounded-lg border border-border bg-surface-elevated px-4 py-3 shadow-lg',
        )}
      >
        {Icon && <Icon color={VARIANT_ICON_COLOR[toast.variant]} size={18} />}
        <Text className="flex-1 text-sm font-medium text-foreground">{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

/** Mounted once at the root (providers/root-provider.tsx), above everything else,
 * so a toast fired from any screen — including one about to unmount, like a
 * status-update confirmation right before the sheet closes — still renders. */
export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 8, paddingHorizontal: 16 }}
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </View>
  );
}
