import { Tabs } from 'expo-router';
import { Bell, CircleUserRound, House, Package } from 'lucide-react-native';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ title: 'Jobs', tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Notifications', tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
