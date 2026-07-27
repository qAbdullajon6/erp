import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Building2, FileText, Headset, Package, Phone, Truck } from 'lucide-react-native';
import {
  Button,
  Card,
  CardTitle,
  ErrorState,
  Header,
  ListItem,
  LoadingState,
  ProgressSteps,
  Section,
  StatusBadge,
  statusLabel,
  Timeline,
  UrgencyBadge,
} from '@/components/ui';
import { colors } from '@/theme/tokens';
import { describeError } from '@/services/api/describe-error';
import { useMyDispatchQuery } from '@/services/api/endpoints/driver';
import { callPhone } from '@/features/jobs/lib/navigation';
import { formatScheduled } from '@/features/jobs/lib/format';
import { getUrgency } from '@/features/jobs/lib/urgency';
import { DISPATCH_LIFECYCLE_LABELS, lifecycleIndex } from '@/features/jobs/lib/lifecycle';
import { StatusActionSheet } from '@/features/jobs/components/status-action-sheet';
import { QuickActions } from '@/features/jobs/components/quick-actions';
import { usePodDraftStore } from '@/store/pod-draft-store';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dispatchQuery = useMyDispatchQuery(id);
  const sheetRef = useRef<BottomSheetModal>(null);
  const podPhotoCount = usePodDraftStore((state) => state.photosByDispatch[id]?.length ?? 0);

  const dispatch = dispatchQuery.data;
  const urgency = dispatch ? getUrgency(dispatch) : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header
        title={dispatch?.dispatchNumber ?? 'Job'}
        subtitle={dispatch ? formatScheduled(dispatch.pickupDateScheduled) : undefined}
        showBack
      />

      {dispatchQuery.isPending ? (
        <LoadingState label="Loading job…" />
      ) : dispatchQuery.isError ? (
        <ErrorState
          description={describeError(dispatchQuery.error, 'Failed to load this job')}
          onRetry={() => dispatchQuery.refetch()}
        />
      ) : dispatch ? (
        <>
          <ScrollView contentContainerClassName="gap-5 px-4 pb-8" showsVerticalScrollIndicator={false}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <StatusBadge status={dispatch.status} />
                {urgency && <UrgencyBadge level={urgency.level} label={urgency.label} />}
              </View>
              <Text className="text-sm text-muted-foreground">{dispatch.order.orderNumber}</Text>
            </View>

            <Card>
              <CardTitle className="mb-3">Mission timeline</CardTitle>
              <ProgressSteps labels={DISPATCH_LIFECYCLE_LABELS} currentIndex={lifecycleIndex(dispatch.status)} />
            </Card>

            <Section title="Quick actions">
              <QuickActions dispatch={dispatch} onUpdateStatus={() => sheetRef.current?.present()} />
            </Section>

            <Card>
              <CardTitle className="mb-2">Customer</CardTitle>
              <ListItem
                title={dispatch.customer.companyName}
                subtitle={dispatch.customer.contactName}
                leading={<Building2 color={colors.mutedForeground} size={20} />}
              />
              {dispatch.customer.phone && (
                <ListItem
                  title={dispatch.customer.phone}
                  subtitle="Tap to call"
                  leading={<Phone color={colors.primary} size={20} />}
                  onPress={() => callPhone(dispatch.customer.phone!)}
                />
              )}
              {dispatch.customer.deliveryNotes && (
                <Text className="px-3 pt-1 text-sm text-muted-foreground">{dispatch.customer.deliveryNotes}</Text>
              )}
            </Card>

            <Card>
              <CardTitle className="mb-2">Route</CardTitle>
              <View className="gap-3">
                <View>
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">Pickup</Text>
                  <Text className="text-base text-foreground">{dispatch.order.pickupAddress}</Text>
                  <Text className="text-sm text-muted-foreground">{dispatch.order.pickupCity}</Text>
                </View>
                <View>
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">Delivery</Text>
                  <Text className="text-base text-foreground">{dispatch.order.deliveryAddress}</Text>
                  <Text className="text-sm text-muted-foreground">{dispatch.order.deliveryCity}</Text>
                </View>
              </View>
            </Card>

            <Card>
              <CardTitle className="mb-2">Cargo</CardTitle>
              <ListItem
                title={dispatch.order.cargoDescription}
                subtitle={dispatch.order.cargoWeightKg ? `${dispatch.order.cargoWeightKg} kg` : undefined}
                leading={<Package color={colors.mutedForeground} size={20} />}
              />
            </Card>

            <Card>
              <CardTitle className="mb-2">Vehicle</CardTitle>
              <ListItem
                title={`${dispatch.vehicle.vehicleCode} · ${dispatch.vehicle.plateNumber}`}
                subtitle={dispatch.vehicle.type}
                leading={<Truck color={colors.mutedForeground} size={20} />}
              />
            </Card>

            <Card>
              <CardTitle className="mb-2">Dispatcher</CardTitle>
              <ListItem
                title="Not available yet"
                subtitle="The API doesn't expose a dispatcher contact for this dispatch"
                leading={<Headset color={colors.mutedForeground} size={20} />}
              />
            </Card>

            <Card>
              <View className="mb-2 flex-row items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  label="Add"
                  onPress={() => router.push(`/(driver)/job/${dispatch.id}/upload-pod`)}
                />
              </View>
              <ListItem
                title={podPhotoCount > 0 ? `${podPhotoCount} photo${podPhotoCount === 1 ? '' : 's'} saved on this device` : 'No documents yet'}
                subtitle="Proof-of-delivery upload isn't live on the backend yet — photos stay local until it is"
                leading={<FileText color={podPhotoCount > 0 ? colors.primary : colors.mutedForeground} size={20} />}
                onPress={() => router.push(`/(driver)/job/${dispatch.id}/upload-pod`)}
              />
            </Card>

            {dispatch.notes && (
              <Card>
                <CardTitle className="mb-2">Notes</CardTitle>
                <Text className="text-sm text-foreground">{dispatch.notes}</Text>
              </Card>
            )}

            {dispatch.statusHistory && dispatch.statusHistory.length > 0 && (
              <Section title="Activity">
                <Card>
                  <Timeline
                    entries={[...dispatch.statusHistory].reverse().map((entry) => ({
                      id: entry.id,
                      title: statusLabel(entry.status),
                      timestamp: formatScheduled(entry.createdAt),
                      description: entry.note ?? undefined,
                    }))}
                  />
                </Card>
              </Section>
            )}
          </ScrollView>

          <View className="border-t border-border bg-background px-4 py-3">
            <Button
              label={dispatch.allowedTransitions.length === 0 ? 'No further steps' : 'Update status'}
              disabled={dispatch.allowedTransitions.length === 0}
              onPress={() => sheetRef.current?.present()}
            />
          </View>

          <StatusActionSheet
            ref={sheetRef}
            dispatchId={dispatch.id}
            dispatchNumber={dispatch.dispatchNumber}
            allowedTransitions={dispatch.allowedTransitions}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}
