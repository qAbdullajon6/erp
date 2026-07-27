import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

/** The router only ever reaches this screen once hydration has finished (see
 * app/_layout.tsx), so `status` here is always a real answer, never "restoring". */
export default function Index() {
  const status = useAuthStore((state) => state.status);

  return <Redirect href={status === 'authenticated' ? '/(driver)/(tabs)/home' : '/(auth)/login'} />;
}
