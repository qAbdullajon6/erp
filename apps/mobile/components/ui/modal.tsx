import { Modal as RNModal, Pressable, View, type ModalProps as RNModalProps } from 'react-native';
import { cn } from '@/lib/utils';

export interface ModalProps extends Pick<RNModalProps, 'visible'> {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/** A centered card over a dim backdrop — the base every confirm dialog (see
 * dialog.tsx) is built from. Kept separate from Dialog because a couple of screens
 * (photo preview on Upload POD) need the backdrop-and-card mechanics without the
 * title/description/button-row layout Dialog imposes. */
export function Modal({ visible, onClose, children, className }: ModalProps) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        className="flex-1 items-center justify-center bg-black/60 px-6"
        accessibilityLabel="Close"
        onPress={onClose}
      >
        <Pressable onPress={(event) => event.stopPropagation()} className="w-full">
          <View className={cn('rounded-xl border border-border bg-surface-elevated p-5', className)}>
            {children}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
