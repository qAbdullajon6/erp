import { ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Header, Section } from '@/components/ui';
import { useTrackingStore } from '@/store/tracking-store';
import { useTrackingQueueStore } from '@/store/tracking-queue-store';
import { useNetworkStore } from '@/store/network-store';
import { flushTrackingQueue } from '@/services/tracking/tracking-queue';
import { startTracking, stopTracking } from '@/services/tracking/tracking-orchestrator';
import { useTick } from '@/hooks/use-tick';
import { formatAge } from '@/features/tracking/lib/format';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-border py-2 last:border-b-0">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function n(value: number | null | undefined, unit = '', digits = 1): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(digits)}${unit}`;
}

/**
 * Hidden diagnostics for GPS testing — only reachable via a long-press on
 * Account's version footer (features/account isn't a real screen file, see
 * app/(driver)/(tabs)/account.tsx), and only ever rendered when `__DEV__` is
 * true. Production builds still ship this route file (Expo Router has no
 * concept of conditionally excluding a route from the bundle), but it
 * immediately redirects away, and there is no way to navigate to it — no
 * link, no button — from a release build. Every value below reads straight
 * from the same stores the Home GPS card does; nothing here is synthesized
 * for display.
 */
export default function DevDiagnosticsScreen() {
  // Hooks run unconditionally, every render, before the __DEV__ gate below —
  // react-hooks/rules-of-hooks doesn't know __DEV__ is build-time-invariant,
  // and more to the point, a route file should never rely on that reasoning
  // holding up under a future edit.
  useTick(1000);
  const tracking = useTrackingStore();
  const queueSize = useTrackingQueueStore((state) => state.positions.length);
  const networkStatus = useNetworkStore((state) => state.status);

  if (!__DEV__) {
    return <Redirect href="/(driver)/(tabs)/home" />;
  }

  const lastResponseText = (() => {
    if (!tracking.lastResponse) return '—';
    if (tracking.lastResponse.kind === 'error') return tracking.lastResponse.message;
    return JSON.stringify(tracking.lastResponse.result, null, 2);
  })();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header title="GPS Diagnostics" subtitle="Development only" showBack />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2" showsVerticalScrollIndicator={false}>
        <Section title="Position">
          <Card>
            <Row label="Latitude" value={n(tracking.lastFix?.latitude, '', 6)} />
            <Row label="Longitude" value={n(tracking.lastFix?.longitude, '', 6)} />
            <Row label="Accuracy" value={n(tracking.lastFix?.accuracyM, ' m')} />
            <Row label="Speed" value={n(tracking.lastFix?.speedKph, ' km/h')} />
            <Row label="Heading" value={n(tracking.lastFix?.heading, '°', 0)} />
            <Row label="Fix age" value={formatAge(tracking.lastFix?.recordedAt ?? null)} />
          </Card>
        </Section>

        <Section title="Session">
          <Card>
            <Row label="Tracking status" value={tracking.lifecycleStatus} />
            <Row label="Movement state" value={tracking.movementState} />
            <Row label="Session id" value={tracking.sessionId ?? '—'} />
            <Row label="Heartbeat age" value={formatAge(tracking.lastHeartbeatAt)} />
            <Row label="Last sync age" value={formatAge(tracking.lastSyncAt)} />
            <Row label="Foreground permission" value={String(tracking.hasForegroundPermission)} />
            <Row label="Background permission" value={String(tracking.hasBackgroundPermission)} />
            <Row label="Background task registered" value={String(tracking.isBackgroundTaskRegistered)} />
            <Row label="Network" value={networkStatus} />
          </Card>
        </Section>

        <Section title="Queue">
          <Card>
            <Row label="Queue size" value={String(queueSize)} />
            <Row label="Packets sent" value={String(tracking.packetsSent)} />
            <Row label="Packets failed" value={String(tracking.packetsFailed)} />
          </Card>
        </Section>

        <Section title="Last response">
          <Card>
            <Text className="font-mono text-xs text-foreground">{lastResponseText}</Text>
          </Card>
        </Section>

        <Section title="Controls">
          <View className="flex-row gap-3">
            <Button variant="outline" label="Flush queue" className="flex-1" onPress={() => void flushTrackingQueue()} />
            <Button
              variant="outline"
              label={tracking.lifecycleStatus === 'tracking' ? 'Stop' : 'Start'}
              className="flex-1"
              onPress={() => {
                if (tracking.lifecycleStatus === 'tracking') void stopTracking('manual');
                else void startTracking();
              }}
            />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
