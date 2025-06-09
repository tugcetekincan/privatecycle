import { Tabs } from 'expo-router';
import { Calendar, Heart, ChartBar as BarChart2, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#f0f0f0',
          paddingTop: 8,
          paddingBottom: 8,
          height: 80,
        },
        tabBarActiveTintColor: '#e91e63',
        tabBarInactiveTintColor: '#888',
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
          tabBarLabel: 'Calendar'
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          tabBarIcon: ({ size, color }) => (
            <Heart size={size} color={color} />
          ),
          tabBarLabel: 'Track'
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          tabBarIcon: ({ size, color }) => (
            <BarChart2 size={size} color={color} />
          ),
          tabBarLabel: 'Insights'
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} />
          ),
          tabBarLabel: 'Settings'
        }}
      />
    </Tabs>
  );
}