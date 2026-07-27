import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, CheckCheck, Fuel, Headset, Navigation as NavigationIcon, Phone, Receipt } from 'lucide-react-native';
import { ActionTile } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { MyDispatch } from '@/services/api/endpoints/driver';
import { callPhone, promptNavigate } from '../lib/navigation';

export interface QuickActionsProps {
  dispatch: MyDispatch;
  onUpdateStatus: () => void;
}

/**
 * The action grid on Home and Job Detail. Every tile here was checked against
 * apps/api before being wired up:
 *
 *   Navigate       real — hands off to the driver's chosen map app (task 4).
 *   Call Customer  real — Customer.phone is on every dispatch response.
 *   Call Dispatcher DISABLED — apps/api's User model has no phone field at all
 *                  (verified against prisma/schema.prisma) and the driver
 *                  endpoint doesn't expose who created the dispatch anyway.
 *                  There is no number to call, so the tile says that instead
 *                  of dialing nothing.
 *   Update Status  real — opens the same StatusActionSheet Job Detail uses.
 *   Upload POD     real UI, no backend yet — see upload-pod.tsx.
 *   Fuel/Expenses  DISABLED — ExpensesController excludes DRIVER entirely, and
 *                  Fuel is just ExpenseCategory.FUEL under the same controller.
 */
export function QuickActions({ dispatch, onUpdateStatus }: QuickActionsProps) {
  const router = useRouter();
  const isPickupLeg = dispatch.status === 'ASSIGNED' || dispatch.status === 'EN_ROUTE_TO_PICKUP';
  const destination = isPickupLeg
    ? { address: dispatch.order.pickupAddress, city: dispatch.order.pickupCity }
    : { address: dispatch.order.deliveryAddress, city: dispatch.order.deliveryCity };

  const tiles = [
    {
      key: 'navigate',
      icon: <NavigationIcon color={colors.primary} size={22} />,
      label: 'Navigate',
      onPress: () => promptNavigate(destination.address, destination.city),
    },
    {
      key: 'call-customer',
      icon: <Phone color={colors.primary} size={22} />,
      label: 'Call Customer',
      onPress: dispatch.customer.phone ? () => callPhone(dispatch.customer.phone!) : undefined,
      disabledReason: dispatch.customer.phone ? undefined : 'No phone number on file for this customer',
    },
    {
      key: 'call-dispatcher',
      icon: <Headset color={colors.mutedForeground} size={22} />,
      label: 'Call Dispatcher',
      disabledReason: 'No dispatcher contact number is available yet',
    },
    {
      key: 'update-status',
      icon: <CheckCheck color={colors.primary} size={22} />,
      label: 'Update Status',
      onPress: onUpdateStatus,
      disabledReason: dispatch.allowedTransitions.length === 0 ? 'No further steps for this dispatch' : undefined,
    },
    {
      key: 'upload-pod',
      icon: <Camera color={colors.primary} size={22} />,
      label: 'Upload POD',
      onPress: () => router.push(`/(driver)/job/${dispatch.id}/upload-pod`),
    },
    {
      key: 'fuel',
      icon: <Fuel color={colors.mutedForeground} size={22} />,
      label: 'Fuel',
      disabledReason: "Driver accounts can't log fuel yet",
    },
    {
      key: 'expenses',
      icon: <Receipt color={colors.mutedForeground} size={22} />,
      label: 'Expenses',
      disabledReason: "Driver accounts can't submit expenses yet",
    },
  ];

  return (
    <View className="flex-row flex-wrap gap-3">
      {tiles.map((tile) => (
        <ActionTile
          key={tile.key}
          icon={tile.icon}
          label={tile.label}
          onPress={tile.onPress}
          disabledReason={tile.disabledReason}
          className="w-[31%]"
        />
      ))}
    </View>
  );
}
