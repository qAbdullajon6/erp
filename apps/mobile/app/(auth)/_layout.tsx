import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

export default function AuthLayout() {
  const status = useAuthStore((state) => state.status);

  // A signed-in driver navigating `back` to /login (or deep-linking into it) should
  // land back in the app, not see a sign-in form for an account they're already in.
  if (status === 'authenticated') {
    return <Redirect href="/(driver)/(tabs)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
