import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import IconTile from '@/components/ui/IconTile';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { typography } from '@/design/tokens';

export default function NotFoundScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Card style={styles.card}>
        <IconTile size={48}><Calendar size={24} color={theme.colors.primary} /></IconTile>
        <Text accessibilityRole="header" style={[typography.todayTitle, { color: theme.colors.text }]}>Let's get you back</Text>
        <Text style={[typography.body, styles.copy, { color: theme.colors.textSecondary }]}>This page isn't available. Your calendar is right where you left it.</Text>
        <PrimaryButton testID="not-found-calendar" title="Back to Calendar" onPress={() => router.replace('/')} />
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: { width: '100%', maxWidth: 400, gap: 16 },
  copy: { lineHeight: 20 },
});
