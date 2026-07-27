import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { useAuthStore } from '@/store/auth-store';
import { ConnectionBanner } from '@/components/ui';

export default function DriverLayout() {
  const status = useAuthStore((state) => state.status);

  if (status !== 'authenticated') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Owns the top safe-area inset for the whole driver stack — individual
       * screens below only need to handle their OWN bottom inset, so the
       * connectivity/sync banner never doubles up with a screen's own header
       * padding or gets clipped under the notch. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <ConnectionBanner />
      </SafeAreaView>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="job/[id]/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="job/[id]/navigation" options={{ presentation: 'card' }} />
        <Stack.Screen name="job/[id]/upload-pod" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="fuel/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sync-queue" options={{ presentation: 'card' }} />
        <Stack.Screen name="dev-diagnostics" options={{ presentation: 'card' }} />
      </Stack>
    </View>
  );
}
