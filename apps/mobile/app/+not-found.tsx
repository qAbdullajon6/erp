import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center">
        <EmptyState icon={<Compass color={colors.mutedForeground} size={32} />} title="Page not found" />
        <Link href="/" className="mt-2 text-center text-primary">
          Go to Home
        </Link>
      </View>
    </SafeAreaView>
  );
}
