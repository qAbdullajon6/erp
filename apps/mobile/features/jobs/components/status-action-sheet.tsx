import { forwardRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { BottomSheet, Button, Input, statusLabel } from '@/components/ui';
import type { DriverActionableStatus } from '@/services/api/endpoints/driver';
import { useStatusUpdate } from '../hooks/use-status-update';

export interface StatusActionSheetProps {
  dispatchId: string;
  dispatchNumber: string;
  allowedTransitions: DriverActionableStatus[];
}

/** The one place a driver advances a dispatch. `allowedTransitions` comes straight
 * from the server on every dispatch response (R13's transition table) — this sheet
 * renders one button per entry and decides nothing about legality itself, matching
 * the same rule the web dispatcher board follows. Offline handling (queue instead
 * of fail) lives in useStatusUpdate, shared with anywhere else a status button
 * appears. */
export const StatusActionSheet = forwardRef<BottomSheetModal, StatusActionSheetProps>(
  ({ dispatchId, dispatchNumber, allowedTransitions }, ref) => {
    const { updateStatus, pendingStatus } = useStatusUpdate({ id: dispatchId, dispatchNumber });
    const [note, setNote] = useState('');

    const handleSelect = async (status: DriverActionableStatus) => {
      try {
        await updateStatus(status, note.trim() || undefined);
        setNote('');
        (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss();
      } catch (error) {
        Alert.alert('Could not update status', error instanceof Error ? error.message : 'Please try again.');
      }
    };

    return (
      <BottomSheet ref={ref} snapPoints={['55%']} enableDynamicSizing={false}>
        <Text className="mb-4 font-display text-lg font-semibold text-foreground">Update status</Text>
        {allowedTransitions.length === 0 ? (
          <Text className="text-sm text-muted-foreground">This dispatch has no further steps.</Text>
        ) : (
          <View className="gap-4">
            <Input
              label="Note (optional)"
              placeholder="e.g. Gate code was wrong, waited 10 min"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={2}
              className="h-16 py-2"
            />
            <View className="gap-2">
              {allowedTransitions.map((status) => (
                <Button
                  key={status}
                  variant="secondary"
                  label={statusLabel(status)}
                  loading={pendingStatus === status}
                  disabled={pendingStatus !== null}
                  onPress={() => handleSelect(status)}
                />
              ))}
            </View>
          </View>
        )}
      </BottomSheet>
    );
  },
);
StatusActionSheet.displayName = 'StatusActionSheet';
