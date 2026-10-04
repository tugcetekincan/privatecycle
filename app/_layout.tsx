import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useMigration } from '@/hooks/useMigration';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useDevSeed } from '@/hooks/useDevSeed';
import { installDevGlobals } from '@/services/devGlobals';

installDevGlobals();

function RootLayoutContent() {
  const { theme } = useTheme();
  const { isCompleted } = useMigration();
  const { ready: isDevSeedReady } = useDevSeed(isCompleted);
  useAutoBackup();

  if (!isCompleted || !isDevSeedReady) {
    return null;
  }
  
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar 
        style={theme.isDark ? "light" : "dark"} 
        backgroundColor={theme.colors.background}
      />
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