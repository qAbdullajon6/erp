import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MapPin, Navigation as NavigationIcon, Settings2 } from 'lucide-react-native';
import { Button, Card, ErrorState, Header, LoadingState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { describeError } from '@/services/api/describe-error';
import { useMyDispatchQuery } from '@/services/api/endpoints/driver';
import { promptNavigate } from '@/features/jobs/lib/navigation';
import { useNavigationPreferenceStore } from '@/store/navigation-preference-store';

const APP_LABEL: Record<string, string> = { google: 'Google Maps', apple: 'Apple Maps', waze: 'Waze' };

/**
 * Hands off to a real navigation app rather than drawing a map in-app — see
 * features/jobs/lib/navigation.ts for why: there is no live-tracking backend to
 * power an in-app map (no fake maps, no fake GPS trail), and this way navigation
 * is real and working today, with the driver's choice of Google Maps / Apple Maps
 * / Waze respected.
 */
export default function NavigationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dispatchQuery = useMyDispatchQuery(id);
  const dispatch = dispatchQuery.data;
  const preferredApp = useNavigationPreferenceStore((state) => state.preferredApp);
  const setPreferredApp = useNavigationPreferenceStore((state) => state.setPreferredApp);

  const currentLeg: 'pickup' | 'delivery' =
    dispatch && (dispatch.status === 'AT_PICKUP' || dispatch.status === 'IN_TRANSIT') ? 'delivery' : 'pickup';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header
        title="Navigate"
        subtitle={dispatch?.dispatchNumber}
        showBack
        right={
          preferredApp && (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel={`Navigation app: ${APP_LABEL[preferredApp]}. Tap to change.`}
              onPress={() => setPreferredApp(null)}
            >
              <Settings2 color={colors.mutedForeground} size={18} />
            </Button>
          )
        }
      />

      {preferredApp && (
        <Text className="px-4 pb-2 text-xs text-muted-foreground">
          Using {APP_LABEL[preferredApp]} · <Text className="text-primary">tap the icon above to change</Text>
        </Text>
      )}

      {dispatchQuery.isPending ? (
        <LoadingState label="Loading route…" />
      ) : dispatchQuery.isError ? (
        <ErrorState
          description={describeError(dispatchQuery.error, 'Failed to load this job')}
          onRetry={() => dispatchQuery.refetch()}
        />
      ) : dispatch ? (
        <View className="gap-4 px-4 pt-2">
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MapPin color={colors.mutedForeground} size={18} />
                <Text className="text-xs font-semibold uppercase text-muted-foreground">Pickup</Text>
              </View>
              {currentLeg === 'pickup' && (
                <View className="rounded-full bg-primary/15 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-primary">Current leg</Text>
                </View>
              )}
            </View>
            <Text className="text-base text-foreground">{dispatch.order.pickupAddress}</Text>
            <Text className="text-sm text-muted-foreground">{dispatch.order.pickupCity}</Text>
            <Button
              variant={currentLeg === 'pickup' ? 'primary' : 'outline'}
              onPress={() => promptNavigate(dispatch.order.pickupAddress, dispatch.order.pickupCity)}
            >
              <NavigationIcon
                color={currentLeg === 'pickup' ? colors.primaryForeground : colors.foreground}
                size={16}
              />
              <Text
                className={`ml-2 font-display text-base font-semibold ${currentLeg === 'pickup' ? 'text-primary-foreground' : 'text-foreground'}`}
              >
                Navigate to pickup
              </Text>
            </Button>
          </Card>

          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MapPin color={colors.primary} size={18} />
                <Text className="text-xs font-semibold uppercase text-muted-foreground">Delivery</Text>
              </View>
              {currentLeg === 'delivery' && (
                <View className="rounded-full bg-primary/15 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-primary">Current leg</Text>
                </View>
              )}
            </View>
            <Text className="text-base text-foreground">{dispatch.order.deliveryAddress}</Text>
            <Text className="text-sm text-muted-foreground">{dispatch.order.deliveryCity}</Text>
            <Button
              variant={currentLeg === 'delivery' ? 'primary' : 'outline'}
              onPress={() => promptNavigate(dispatch.order.deliveryAddress, dispatch.order.deliveryCity)}
            >
              <NavigationIcon
                color={currentLeg === 'delivery' ? colors.primaryForeground : colors.foreground}
                size={16}
              />
              <Text
                className={`ml-2 font-display text-base font-semibold ${currentLeg === 'delivery' ? 'text-primary-foreground' : 'text-foreground'}`}
              >
                Navigate to delivery
              </Text>
            </Button>
          </Card>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
