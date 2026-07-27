import { Text, View } from 'react-native';
import { HeartPulse, MapPin, Radar, RefreshCw, Satellite, ShieldCheck } from 'lucide-react-native';
import { Card, CardTitle } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { cn } from '@/lib/utils';
import { useTrackingStore, computeGpsStatus, type GpsSignalStatus } from '@/store/tracking-store';
import { useNetworkStore } from '@/store/network-store';
import { useTick } from '@/hooks/use-tick';
import { formatAge } from '../lib/format';

const GPS_LABEL: Record<GpsSignalStatus, string> = {
  connected: 'Connected',
  waiting: 'Waiting',
  offline: 'Offline',
};

const GPS_TONE: Record<GpsSignalStatus, string> = {
  connected: 'text-success',
  waiting: 'text-warning',
  offline: 'text-muted-foreground',
};

function StatusRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-sm text-muted-foreground">{label}</Text>
      </View>
      <Text className={cn('text-sm font-semibold text-foreground', tone)}>{value}</Text>
    </View>
  );
}

/**
 * Home screen's GPS panel — every value read straight from store/tracking-
 * store.ts, which is only ever written by a real permission check, a real GPS
 * fix, or a real server response (services/tracking/*). Nothing here is
 * computed to look reassuring; a driver who hasn't granted location yet sees
 * exactly that, not a green "Connected" pill.
 */
export function GpsStatusCard() {
  useTick(1000);

  const lifecycleStatus = useTrackingStore((state) => state.lifecycleStatus);
  const movementState = useTrackingStore((state) => state.movementState);
  const hasForegroundPermission = useTrackingStore((state) => state.hasForegroundPermission);
  const hasBackgroundPermission = useTrackingStore((state) => state.hasBackgroundPermission);
  const lastFix = useTrackingStore((state) => state.lastFix);
  const lastSyncAt = useTrackingStore((state) => state.lastSyncAt);
  const lastHeartbeatAt = useTrackingStore((state) => state.lastHeartbeatAt);
  const isNetworkOnline = useNetworkStore((state) => state.status === 'online');

  const gpsStatus = computeGpsStatus({ lifecycleStatus, lastFix, lastSyncAt, isNetworkOnline });
  const isTracking = lifecycleStatus === 'tracking';

  return (
    <Card>
      <View className="mb-1 flex-row items-center justify-between">
        <CardTitle>GPS Tracking</CardTitle>
        {isTracking && (
          <View className="rounded-full bg-primary/15 px-2 py-0.5">
            <Text className="text-xs font-semibold text-primary">
              {movementState === 'moving' ? 'Moving' : movementState === 'stopped' ? 'Stopped' : 'Starting…'}
            </Text>
          </View>
        )}
      </View>

      <StatusRow
        icon={<Satellite color={colors.mutedForeground} size={16} />}
        label="GPS"
        value={GPS_LABEL[gpsStatus]}
        tone={GPS_TONE[gpsStatus]}
      />
      <StatusRow
        icon={<Radar color={colors.mutedForeground} size={16} />}
        label="Tracking"
        value={
          isTracking
            ? 'Tracking'
            : lifecycleStatus === 'starting'
              ? 'Starting'
              : lifecycleStatus === 'error'
                ? 'Error'
                : 'Stopped'
        }
        tone={isTracking ? 'text-success' : lifecycleStatus === 'error' ? 'text-warning' : 'text-muted-foreground'}
      />
      <StatusRow
        icon={<MapPin color={colors.mutedForeground} size={16} />}
        label="Location permission"
        value={hasForegroundPermission ? 'Granted' : 'Not granted'}
        tone={hasForegroundPermission ? undefined : 'text-warning'}
      />
      <StatusRow
        icon={<ShieldCheck color={colors.mutedForeground} size={16} />}
        label="Background tracking"
        value={hasBackgroundPermission ? 'On' : 'Off'}
        tone={hasBackgroundPermission ? undefined : 'text-muted-foreground'}
      />
      <StatusRow
        icon={<HeartPulse color={colors.mutedForeground} size={16} />}
        label="Heartbeat"
        value={formatAge(lastHeartbeatAt)}
      />
      <StatusRow
        icon={<RefreshCw color={colors.mutedForeground} size={16} />}
        label="Last sync"
        value={formatAge(lastSyncAt)}
      />
    </Card>
  );
}
