import { forwardRef } from 'react';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { colors } from '@/theme/tokens';

export type BottomSheetRef = BottomSheetModal;

export interface BottomSheetProps extends Omit<BottomSheetModalProps, 'backgroundStyle' | 'handleIndicatorStyle'> {
  children: React.ReactNode;
}

/**
 * The action-sheet surface used for "choose next status" on Job Detail. Wraps
 * @gorhom/bottom-sheet (the RN ecosystem's actual standard for this — a hand-rolled
 * Animated + PanResponder version would be strictly worse and untested) with the
 * app's dark theme, so no screen re-declares backgroundStyle/handleIndicatorStyle.
 *
 * Not styled via NativeWind `className`: BottomSheetModal/BottomSheetView aren't
 * registered with NativeWind's `cssInterop`, so a `className` prop on them would
 * silently do nothing rather than throw — plain style objects here are the correct,
 * working choice, not an oversight.
 */
export const BottomSheet = forwardRef<BottomSheetModal, BottomSheetProps>(({ children, ...props }, ref) => {
  return (
    <BottomSheetModal
      ref={ref}
      backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      backdropComponent={(backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
      )}
      {...props}
    >
      <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 }}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
BottomSheet.displayName = 'BottomSheet';
