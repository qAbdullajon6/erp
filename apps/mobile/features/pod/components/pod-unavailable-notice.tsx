import { Text, View } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { colors } from '@/theme/tokens';

/**
 * apps/web ships a delivery-proofs API client, hooks, and a `<DeliveryProofPanel>`
 * component (apps/web/src/lib/api/delivery-proofs.ts,
 * apps/web/src/components/dispatch/delivery-proof-panel.tsx) that call
 * `POST /dispatches/:id/proofs/photo` — but no such route exists anywhere in
 * apps/api (verified: no controller matches "proofs" in apps/api/src). That web
 * client is dead code with no backend behind it today.
 *
 * Rather than reproduce that same dead call here, this screen captures real
 * photos (compressed, timestamped, geotagged — services/pod/pod-capture.ts) and
 * keeps them as local drafts on the device (store/pod-draft-store.ts) instead of
 * pretending an upload succeeded. Wiring this up for real is "add the missing
 * NestJS route, point the Upload button at it" — a backend task, not a mobile
 * one. See the mobile foundation report.
 */
export function PodUnavailableNotice() {
  return (
    <View className="flex-row items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
      <CloudOff color={colors.warning} size={20} />
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold text-foreground">Saved on your device only</Text>
        <Text className="text-sm text-muted-foreground">
          The backend endpoint for proof-of-delivery uploads hasn&rsquo;t shipped yet, so photos stay on your phone
          for now — they&rsquo;ll upload automatically the moment that&rsquo;s possible. Nothing is lost.
        </Text>
      </View>
    </View>
  );
}
