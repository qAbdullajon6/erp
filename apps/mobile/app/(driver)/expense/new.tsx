import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReceiptText } from 'lucide-react-native';
import { EmptyState, Header } from '@/components/ui';
import { colors } from '@/theme/tokens';

/**
 * apps/api's ExpensesController scopes every route (list/create/update/approve/
 * reject) to ADMIN, ACCOUNTANT, and OPERATIONS_MANAGER only — the controller's own
 * comment states DRIVER "likewise has no access." Building a submission form here
 * would let a driver fill it out and submit to an endpoint the server is guaranteed
 * to 403 on, which is worse than not having the screen at all. This is
 * architecture — the route, the header, the empty state — ready for the day a
 * driver-facing expense-submission endpoint exists.
 */
export default function NewExpenseScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header title="Log expense" showBack />
      <View className="flex-1 justify-center">
        <EmptyState
          icon={<ReceiptText color={colors.mutedForeground} size={32} />}
          title="Not available yet"
          description="Expense submission isn't open to driver accounts on the backend yet — this screen is ready to connect once that endpoint exists."
        />
      </View>
    </SafeAreaView>
  );
}
