import { Text, View } from 'react-native';
import { Button, type ButtonProps } from './button';
import { Modal } from './modal';

export interface DialogProps {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps['variant'];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The confirm-before-you-commit dialog — "Mark as Delivered?", "Sign out?". Every
 * driver-facing status change that can't be undone from the app goes through this
 * rather than firing on the first tap. */
export function Dialog({
  visible,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <Modal visible={visible} onClose={onCancel}>
      <View className="gap-2">
        <Text className="font-display text-lg font-semibold text-foreground">{title}</Text>
        {description && <Text className="text-sm text-muted-foreground">{description}</Text>}
      </View>
      <View className="mt-5 flex-row gap-3">
        <Button variant="outline" label={cancelLabel} onPress={onCancel} className="flex-1" disabled={loading} />
        <Button
          variant={confirmVariant}
          label={confirmLabel}
          onPress={onConfirm}
          className="flex-1"
          loading={loading}
        />
      </View>
    </Modal>
  );
}
