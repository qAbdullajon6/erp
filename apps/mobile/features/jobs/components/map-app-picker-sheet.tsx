import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Check, MapPin, Navigation as NavigationIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet, ListItem } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useMapPickerStore } from '@/store/map-picker-store';
import { useNavigationPreferenceStore, type MapApp } from '@/store/navigation-preference-store';
import { getAvailableMapApps, openInMapApp, type MapAppOption } from '../lib/navigation';

/**
 * Mounted once, globally (providers/root-provider.tsx) — any screen starts
 * navigation with `promptNavigate()` (../lib/navigation.ts) rather than needing
 * its own sheet instance and ref, matching the pattern StatusActionSheet uses
 * for BottomSheet-per-screen but shared across the whole app since "which map
 * app" isn't tied to any one screen.
 */
export function MapAppPickerSheet() {
  const destination = useMapPickerStore((state) => state.destination);
  const close = useMapPickerStore((state) => state.close);
  const setPreferredApp = useNavigationPreferenceStore((state) => state.setPreferredApp);
  const sheetRef = useRef<BottomSheetModal>(null);
  const [apps, setApps] = useState<MapAppOption[] | null>(null);
  const [rememberChoice, setRememberChoice] = useState(true);

  useEffect(() => {
    if (destination) {
      getAvailableMapApps().then(setApps);
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [destination]);

  const handleSelect = async (app: MapApp) => {
    if (!destination) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (rememberChoice) setPreferredApp(app);
    await openInMapApp(app, destination.address, destination.city);
    close();
  };

  return (
    <BottomSheet ref={sheetRef} snapPoints={['45%']} enableDynamicSizing={false} onDismiss={close}>
      <Text className="mb-1 font-display text-lg font-semibold text-foreground">Navigate with</Text>
      {destination && (
        <Text className="mb-4 text-sm text-muted-foreground" numberOfLines={1}>
          {destination.address}, {destination.city}
        </Text>
      )}

      <View className="gap-1">
        {(apps ?? []).map((app) => (
          <ListItem
            key={app.id}
            title={app.name}
            subtitle={app.isAvailable ? undefined : 'Opens in browser'}
            leading={<NavigationIcon color={colors.primary} size={20} />}
            onPress={() => handleSelect(app.id)}
            showChevron
          />
        ))}
        {apps === null && <Text className="px-3 py-2 text-sm text-muted-foreground">Checking installed apps…</Text>}
        {apps !== null && apps.length === 0 && (
          <View className="flex-row items-center gap-2 px-3 py-2">
            <MapPin color={colors.mutedForeground} size={16} />
            <Text className="text-sm text-muted-foreground">No supported map apps found on this device.</Text>
          </View>
        )}
      </View>

      <ListItem
        className="mt-2 border-t border-border pt-3"
        title="Always use this app"
        subtitle="Skip this screen next time"
        leading={
          <View
            className="h-5 w-5 items-center justify-center rounded border"
            style={{ borderColor: rememberChoice ? colors.primary : colors.border }}
          >
            {rememberChoice && <Check color={colors.primary} size={14} />}
          </View>
        }
        onPress={() => setRememberChoice((value) => !value)}
      />
    </BottomSheet>
  );
}
