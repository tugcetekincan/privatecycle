import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Heart, ChartBar as BarChart2, Settings } from 'lucide-react-native';
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
            fontSize: 12,
            fontWeight: '500',
            marginTop: 4,
          },
          tabBarIconStyle: {
            marginBottom: 0,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ size, color }) => (
              <Calendar size={size} color={color} />
            ),
            tabBarLabel: 'Calendar',
            tabBarButtonTestID: 'tab-calendar',
          }}
        />
        <Tabs.Screen
          name="track"
          options={{
            tabBarIcon: ({ size, color }) => (
              <Heart size={size} color={color} />
            ),
            tabBarLabel: 'Track',
            tabBarButtonTestID: 'tab-track',
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            tabBarIcon: ({ size, color }) => (
              <BarChart2 size={size} color={color} />
            ),
            tabBarLabel: 'Insights',
            tabBarButtonTestID: 'tab-insights',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarIcon: ({ size, color }) => (
              <Settings size={size} color={color} />
            ),
            tabBarLabel: 'Settings',
            tabBarButtonTestID: 'tab-settings',
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}