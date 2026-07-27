import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fuel as FuelIcon } from 'lucide-react-native';
import { EmptyState, Header } from '@/components/ui';
import { colors } from '@/theme/tokens';

/**
 * There is no separate "fuel log" entity in apps/api — fuel spend is one value of
 * Expense.category (ExpenseCategory.FUEL, apps/api/prisma/schema.prisma), and
 * DRIVER has no access to any Expenses route (see expense/new.tsx). Same
 * architecture-only treatment, same reason.
 */
export default function NewFuelLogScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header title="Log fuel" showBack />
      <View className="flex-1 justify-center">
        <EmptyState
          icon={<FuelIcon color={colors.mutedForeground} size={32} />}
          title="Not available yet"
          description="Fuel is logged as an expense category on the backend, and driver accounts can't submit expenses yet — this screen is ready to connect once that changes."
        />
      </View>
    </SafeAreaView>
  );
}
