import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginForm } from '@/features/auth/components/login-form';

export default function LoginScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          contentContainerClassName="flex-1 justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-10 gap-1">
            <Text className="font-display text-3xl font-bold text-foreground">FlowERP Driver</Text>
            <Text className="text-base text-muted-foreground">Sign in with your driver account.</Text>
          </View>
          <LoginForm />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
