import { ActivityIndicator, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useMigration } from '@/hooks/useMigration';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useDevSeed } from '@/hooks/useDevSeed';
import { useFirstRun } from '@/hooks/useFirstRun';
import { useNotifications } from '@/hooks/useNotifications';
import FirstRun from '@/components/onboarding/FirstRun';
import { installDevGlobals } from '@/services/devGlobals';

installDevGlobals();

function RootLayoutContent() {
  const { theme } = useTheme();
  const { isCompleted } = useMigration();
  const { ready: isDevSeedReady } = useDevSeed(isCompleted);
  const firstRun = useFirstRun(isCompleted && isDevSeedReady);
  const appReady = isCompleted && isDevSeedReady && firstRun.status === 'app';
  useAutoBackup();
  useNotifications(appReady);

  if (!appReady && firstRun.status === 'loading') {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: theme.colors.background }}>
      <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Opening your calendar" />
      <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>Opening your calendar…</Text>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
    </View>;
  }

  return (
    <SafeAreaProvider>
      {firstRun.status === 'welcome' ? (
        <FirstRun
          onStartLastPeriod={firstRun.startLastPeriod}
          onSkip={firstRun.skip}
          onImported={() => firstRun.complete('import')}
        />
      ) : (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      )}
      <StatusBar style={theme.isDark ? "light" : "dark"} />
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}
