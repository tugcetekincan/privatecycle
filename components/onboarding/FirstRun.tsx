import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, BellOff, ChevronLeft, Lock, Upload } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useDialog } from '@/hooks/useDialog';
import { BackupService } from '@/services/BackupService';
import ScreenFade from '@/components/ui/ScreenFade';
import { Card } from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { spacing, typography } from '@/design/tokens';
import {
  TidemarkArcHero,
  TidemarkCalendarIllustration,
  TidemarkPrivacyIllustration,
} from './TidemarkArt';

interface FirstRunProps {
  onStartLastPeriod: () => Promise<void>;
  onSkip: () => Promise<void>;
  onImported: () => Promise<void>;
}

type Step = 0 | 1 | 2;

const STEP_COUNT = 3;

/**
 * Three-step, skippable first-run guide using the approved Tidemark direction.
 * It is a root gate rather than a route, so every exit lands on the existing
 * Calendar; no data is written here and no notification permission is asked
 * for. Completion and pending-last-period semantics live in OnboardingService.
 */
export default function FirstRun({
  onStartLastPeriod,
  onSkip,
  onImported,
}: FirstRunProps) {
  const { theme } = useTheme();
  const { showConfirm, showSuccess, showError, DialogComponent } = useDialog();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    // Moving between steps always starts at the top of the new screen. No
    // animation keeps this instant and reduced-motion friendly.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const goNext = () => {
    if (busy) return;
    setStep((current) => (current < STEP_COUNT - 1 ? ((current + 1) as Step) : current));
  };

  const goBack = () => {
    if (busy) return;
    setStep((current) => (current > 0 ? ((current - 1) as Step) : current));
  };

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onStartLastPeriod();
    } catch (error) {
      console.error('Error starting last-period setup:', error);
      setBusy(false);
      showError('Could not start setup', 'Please try again.');
    }
  };

  const handleSkip = async () => {
    if (busy) return;
    await onSkip();
  };

  const importBackup = () => {
    if (busy) return;
    showConfirm(
      'Import Backup',
      'This will replace your cycle data with the backup data. Private calendar entries are only replaced if the backup includes them. Are you sure you want to continue?',
      async () => {
        setBusy(true);
        try {
          const result = await BackupService.importBackup();
          if (result.cancelled) return;
          if (!result.success) {
            showError('Import Failed', result.message);
            return;
          }

          showSuccess('Backup imported', result.message, () => {
            void onImported();
          });
        } catch (error) {
          console.error('Error importing backup:', error);
          showError('Error', 'Failed to import backup');
        } finally {
          setBusy(false);
        }
      },
      undefined,
      'Import',
      'Cancel',
      true
    );
  };

  const eyebrowIndex = step + 1;

  return (
    <SafeAreaView
      testID="first-run-screen"
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.frame}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            {step === 2 ? (
              <TouchableOpacity
                testID="first-run-back"
                accessibilityRole="button"
                accessibilityLabel="Back to the previous step"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={goBack}
                style={styles.backButton}>
                <ChevronLeft size={18} color={theme.colors.textSecondary} />
                <Text style={[typography.rowTitle, { color: theme.colors.textSecondary }]}>
                  Back
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.brandRow}>
                <View style={[styles.brandDiamond, { backgroundColor: theme.colors.primary }]} />
                <Text style={[styles.brandText, { color: theme.colors.text }]}>PrivateCycle</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            testID="first-run-skip"
            accessibilityRole="button"
            accessibilityLabel="Skip setup and open Calendar"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={handleSkip}
            style={styles.skipButton}>
            <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScreenFade>
          <ScrollView
            testID="first-run-scroll"
            ref={scrollRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>
            {step === 0 && (
              <View testID="first-run-step-1" style={styles.stepFill}>
                <TidemarkArcHero />
                <View style={styles.stepCopy}>
                  <StepEyebrow index={eyebrowIndex} />
                  <Text
                    testID="first-run-title"
                    accessibilityRole="header"
                    style={[typography.pageTitle, styles.title, { color: theme.colors.text }]}>
                    Find your{'\n'}own rhythm.
                  </Text>
                  <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
                    Make room for the patterns that are yours.
                  </Text>

                  <View style={styles.pushDown} />
                  <View style={styles.quietLine}>
                    <Lock size={12} color={theme.colors.primaryText} />
                    <Text style={[styles.quietLineText, { color: theme.colors.textSecondary }]}>
                      Private by design. Yours to keep.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {step === 1 && (
              <View testID="first-run-step-2" style={styles.stepCopy}>
                <StepEyebrow index={eyebrowIndex} />
                <Text
                  testID="first-run-title"
                  accessibilityRole="header"
                  style={[typography.pageTitle, styles.title, { color: theme.colors.text }]}>
                  A small note.{'\n'}A clearer picture.
                </Text>

                <TidemarkCalendarIllustration />

                <Text style={[typography.body, styles.stepBody, { color: theme.colors.textSecondary }]}>
                  Start with the first day of your last period. Add only what you remember.
                </Text>

                <Card
                  testID="first-run-estimates"
                  tone="tint"
                  padding={12}
                  style={styles.estimateCard}>
                  <Text style={[styles.estimateText, { color: theme.colors.textSecondary }]}>
                    Forecasts are estimates—not birth control or medical advice. Standard estimates
                    are labelled until there is enough history.
                  </Text>
                </Card>
              </View>
            )}

            {step === 2 && (
              <View testID="first-run-step-3" style={styles.stepCopy}>
                <StepEyebrow index={eyebrowIndex} />
                <Text
                  testID="first-run-title"
                  accessibilityRole="header"
                  style={[typography.pageTitle, styles.title, { color: theme.colors.text }]}>
                  Yours means{'\n'}yours.
                </Text>

                <TidemarkPrivacyIllustration />

                <View testID="first-run-privacy" style={styles.statements}>
                  <View style={[styles.statement, { borderTopColor: theme.colors.border }]}>
                    <View style={[styles.statementDash, { backgroundColor: theme.colors.primary }]} />
                    <Text style={[styles.statementText, { color: theme.colors.textSecondary }]}>
                      <Text style={[styles.statementLead, { color: theme.colors.text }]}>
                        No account or cloud sync.
                      </Text>{' '}
                      Your log stays on this device.
                    </Text>
                  </View>
                  <View
                    testID="first-run-backups"
                    style={[
                      styles.statement,
                      {
                        borderTopColor: theme.colors.border,
                        borderBottomColor: theme.colors.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}>
                    <View style={[styles.statementDash, { backgroundColor: theme.colors.primary }]} />
                    <Text style={[styles.statementText, { color: theme.colors.textSecondary }]}>
                      <Text style={[styles.statementLead, { color: theme.colors.text }]}>
                        Keep an exported backup.
                      </Text>{' '}
                      It’s the only way to recover your history after losing your device or
                      uninstalling.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </ScreenFade>

        <View testID="first-run-footer" style={styles.footer}>
          {step === 0 && (
            <PrimaryButton
              testID="first-run-next"
              title="Continue"
              onPress={goNext}
              icon={<ArrowRight size={17} color={theme.colors.white} />}
            />
          )}

          {step === 1 && (
            <View style={styles.footerRow}>
              <PrimaryButton
                testID="first-run-back"
                title="Back"
                variant="secondary"
                onPress={goBack}
                style={styles.backAction}
              />
              <PrimaryButton
                testID="first-run-next"
                title="Continue"
                onPress={goNext}
                icon={<ArrowRight size={17} color={theme.colors.white} />}
                style={styles.nextAction}
              />
            </View>
          )}

          {step === 2 && (
            <>
              <PrimaryButton
                testID="first-run-start-period"
                title="Start with my last period"
                onPress={handleStart}
                disabled={busy}
                icon={<ArrowRight size={17} color={theme.colors.white} />}
              />
              <PrimaryButton
                testID="first-run-import"
                title="Import a backup"
                variant="secondary"
                icon={<Upload size={17} color={theme.colors.primary} />}
                onPress={importBackup}
                loading={busy}
                style={styles.footerGap}
              />
              <TouchableOpacity
                testID="first-run-explore"
                accessibilityRole="button"
                accessibilityLabel="Explore Calendar without setting up a last period"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={handleSkip}
                style={styles.exploreButton}>
                <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
                  I’m unsure — explore Calendar
                </Text>
              </TouchableOpacity>
              <View style={styles.reminderLine}>
                <BellOff size={12} color={theme.colors.textSecondary} />
                <Text style={[styles.reminderText, { color: theme.colors.textSecondary }]}>
                  Reminders stay off until you choose.
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
      <DialogComponent />
    </SafeAreaView>
  );
}

function StepEyebrow({ index }: { index: number }) {
  const { theme } = useTheme();

  return (
    <View style={styles.eyebrowRow}>
      <View style={[styles.eyebrowRule, { backgroundColor: theme.colors.primaryWeak }]} />
      <Text
        testID="first-run-step-label"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Step ${index} of ${STEP_COUNT}`}
        style={[styles.eyebrow, { color: theme.colors.primaryText }]}>
        TIDEMARK · 0{index}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDiamond: {
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  brandText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  skipButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: spacing.base,
  },
  skipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  backButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingRight: spacing.base,
  },
  content: {
    flexGrow: 1,
    paddingBottom: spacing.base,
  },
  stepFill: {
    flexGrow: 1,
  },
  stepCopy: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  eyebrowRule: {
    width: 1,
    height: 13,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  stepBody: {
    marginTop: spacing.lg,
  },
  pushDown: {
    flexGrow: 1,
    minHeight: spacing.xxl,
  },
  quietLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: spacing.lg,
  },
  quietLineText: {
    fontSize: 10.5,
    lineHeight: 15,
  },
  estimateCard: {
    marginTop: spacing.base,
  },
  estimateText: {
    fontSize: 11,
    lineHeight: 17,
  },
  statements: {
    marginTop: spacing.xs,
  },
  statement: {
    flexDirection: 'row',
    gap: spacing.base,
    paddingVertical: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statementDash: {
    width: 12,
    height: 1,
    marginTop: 9,
  },
  statementText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 18,
  },
  statementLead: {
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  backAction: {
    width: 96,
  },
  nextAction: {
    flex: 1,
  },
  footerGap: {
    marginTop: spacing.sm,
  },
  exploreButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderLine: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reminderText: {
    fontSize: 10.5,
    lineHeight: 15,
  },
});
