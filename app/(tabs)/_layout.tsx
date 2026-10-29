import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, TrendingUp, Lightbulb, Settings } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';

export default function TabLayout() {
  const { theme } = useTheme();
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: 8,
            paddingBottom: 8,
            height: 80,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 4,
          },
          tabBarIconStyle: {
            marginBottom: 0,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ color }) => (
              <Calendar size={22} color={color} />
            ),
            tabBarLabel: 'Calendar',
            tabBarButtonTestID: 'tab-calendar',
          }}
        />
        <Tabs.Screen
          name="track"
          options={{
            tabBarIcon: ({ color }) => (
              <TrendingUp size={22} color={color} />
            ),
            tabBarLabel: 'Overview',
            tabBarButtonTestID: 'tab-overview',
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            tabBarIcon: ({ color }) => (
              <Lightbulb size={22} color={color} />
            ),
            tabBarLabel: 'Insights',
            tabBarButtonTestID: 'tab-insights',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarIcon: ({ color }) => (
              <Settings size={22} color={color} />
            ),
            tabBarLabel: 'Settings',
            tabBarButtonTestID: 'tab-settings',
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}