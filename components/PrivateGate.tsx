import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Lock, ShieldAlert, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, spacing, typography } from '@/design/tokens';
import ScreenFade from '@/components/ui/ScreenFade';
import { Card } from '@/components/ui/Card';
import { useDialog } from '@/hooks/useDialog';
import { DataService } from '@/services/DataService';
import { PrivateAccessService } from '@/services/PrivateAccessService';
import { isValidPin, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/services/privateAccess/pin';

interface PrivateGateContextValue {
  lock: () => void;
}

const PrivateGateContext = createContext<PrivateGateContextValue | null>(null);

/** Access the lock action from inside the unlocked private calendar. */
export const usePrivateGate = (): PrivateGateContextValue => {
  const value = useContext(PrivateGateContext);
  if (!value) {
    throw new Error('usePrivateGate must be used inside PrivateGate');
  }
  return value;
};

type GateMode = 'loading' | 'setup' | 'unlock' | 'error';

interface PrivateGateProps {
  children: React.ReactNode;
}

const sanitizePin = (value: string): string =>
  value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH);

export default function PrivateGate({ children }: PrivateGateProps) {
  const { theme } = useTheme();
  const { showConfirm, DialogComponent } = useDialog();
  const router = useRouter();

  const [mode, setMode] = useState<GateMode>('loading');
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [setupPin, setSetupPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const unlockedRef = useRef(false);
  const configuredRef = useRef(false);
  const confirmInput = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  useEffect(() => {
    configuredRef.current = configured;
  }, [configured]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const isConfigured = await PrivateAccessService.isConfigured();
        if (!active) return;
        setConfigured(isConfigured);
        configuredRef.current = isConfigured;
        setMode(isConfigured ? 'unlock' : 'setup');
      } catch {
        if (!active) return;
        setMode('error');
        setError('The saved private-access settings could not be read.');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Leaving the app hides the calendar; coming back always requires the PIN.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') return;

      setEnteredPin('');
      setSetupPin('');
      setConfirmPin('');
      setError('');

      if (unlockedRef.current) {
        unlockedRef.current = false;
        setUnlocked(false);
        setMode(configuredRef.current ? 'unlock' : 'setup');
      }
    });

    return () => subscription.remove();
  }, []);

  // React Native Web's AppState does not consistently report tab visibility.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleVisibility = () => {
      if (!document.hidden) return;

      setEnteredPin('');
      setSetupPin('');
      setConfirmPin('');
      setError('');

      if (unlockedRef.current) {
        unlockedRef.current = false;
        setUnlocked(false);
        setMode(configuredRef.current ? 'unlock' : 'setup');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const closeRoute = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  }, [router]);

  const handleLock = useCallback(() => {
    setUnlocked(false);
    unlockedRef.current = false;
    setMode(configuredRef.current ? 'unlock' : 'setup');
    setEnteredPin('');
    setError('');
  }, []);

  const resetPrivateAccess = useCallback(async () => {
    setBusy(true);
    try {
      await DataService.clearIntimateData();
      await PrivateAccessService.reset();
      setConfigured(false);
      configuredRef.current = false;
      setUnlocked(false);
      unlockedRef.current = false;
      setMode('setup');
      setSetupPin('');
      setConfirmPin('');
      setEnteredPin('');
      setError('');
    } catch {
      setMode('error');
      setError('Private access could not be reset. Please try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleForgot = useCallback(() => {
    showConfirm(
      'Reset private access',
      'The only way to reset the PIN is to delete every private calendar entry in the app. Existing backup files are not changed. This cannot be undone.',
      resetPrivateAccess,
      undefined,
      'Delete and reset',
      'Cancel',
      true
    );
  }, [resetPrivateAccess, showConfirm]);

  const handleSetup = useCallback(async () => {
    if (!isValidPin(setupPin)) {
      setError(`Choose a ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit PIN.`);
      return;
    }
    if (setupPin !== confirmPin) {
      setError('The PINs do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await PrivateAccessService.setupPin(setupPin);
      setConfigured(true);
      configuredRef.current = true;
      setUnlocked(true);
      unlockedRef.current = true;
      setMode('unlock');
      setSetupPin('');
      setConfirmPin('');
    } catch {
      setError('Could not save the PIN. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [confirmPin, setupPin]);

  const handleUnlock = useCallback(async () => {
    if (!isValidPin(enteredPin)) {
      setError(`Enter your ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit PIN.`);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await PrivateAccessService.verifyPin(enteredPin);
      if (result.ok) {
        setUnlocked(true);
        unlockedRef.current = true;
        setMode('unlock');
        setEnteredPin('');
        return;
      }

      if (result.reason === 'locked') {
        const seconds = Math.max(1, Math.ceil((result.retryAfterMs ?? 0) / 1000));
        setError(`Too many attempts. Try again in ${seconds}s.`);
      } else if (result.reason === 'missing') {
        setConfigured(false);
        configuredRef.current = false;
        setMode('setup');
        setError('No PIN is set. Create one to use the private calendar.');
      } else {
        setError('Incorrect PIN.');
      }
      setEnteredPin('');
    } catch {
      setError('Could not verify the PIN. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [enteredPin]);

  const contextValue = useMemo(() => ({ lock: handleLock }), [handleLock]);

  if (unlocked) {
    return (
      <PrivateGateContext.Provider value={contextValue}>
        {children}
      </PrivateGateContext.Provider>
    );
  }

  const styles = createStyles(theme);
  const isSetup = mode === 'setup';
  const isError = mode === 'error';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="private-gate-close"
          onPress={closeRoute}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close private calendar">
          <X size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenFade>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
          <Card style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }} padding={24}>
          <View style={styles.lockCircle}>
            {isError ? (
              <ShieldAlert size={30} color={theme.colors.error} />
            ) : (
              <Lock size={30} color={theme.colors.primary} />
            )}
          </View>

          <Text style={styles.title}>Private calendar</Text>
          <Text style={styles.subtitle}>
            {mode === 'loading'
              ? 'Checking private access…'
              : isError
                ? 'Private access is unavailable.'
                : isSetup
                  ? 'Create a PIN to keep this calendar out of casual view.'
                  : 'Enter your PIN to open the private calendar.'}
          </Text>

          {mode === 'loading' ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading private access…</Text>
            </View>
          ) : isError ? (
            <>
              <Text testID="private-pin-error" style={styles.errorText}>
                {error}
              </Text>
              <TouchableOpacity
                testID="private-pin-reset"
                style={[styles.primaryButton, styles.destructiveButton]}
                onPress={handleForgot}
                disabled={busy}
                accessibilityRole="button">
                <Text style={styles.primaryButtonText}>Delete private data and reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="private-error-close"
                style={styles.secondaryButton}
                onPress={closeRoute}
                accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : isSetup ? (
            <>
              <Text style={styles.label}>CHOOSE A PIN</Text>
              <TextInput
                testID="private-pin-setup-input"
                accessibilityLabel="Choose a PIN"
                style={styles.input}
                value={setupPin}
                onChangeText={value => setSetupPin(sanitizePin(value))}
                secureTextEntry
                autoComplete="off"
                keyboardType="number-pad"
                maxLength={PIN_MAX_LENGTH}
                editable={!busy}
                autoFocus
                placeholder={`${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits`}
                placeholderTextColor={theme.colors.textSecondary}
                returnKeyType="next"
                onSubmitEditing={() => confirmInput.current?.focus()}
              />

              <Text style={styles.label}>CONFIRM PIN</Text>
              <TextInput
                ref={confirmInput}
                testID="private-pin-setup-confirm"
                accessibilityLabel="Confirm PIN"
                style={styles.input}
                value={confirmPin}
                onChangeText={value => setConfirmPin(sanitizePin(value))}
                secureTextEntry
                autoComplete="off"
                keyboardType="number-pad"
                maxLength={PIN_MAX_LENGTH}
                editable={!busy}
                placeholder="Repeat the PIN"
                placeholderTextColor={theme.colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={handleSetup}
              />

              {error ? (
                <Text testID="private-pin-error" style={styles.errorText}>
                  {error}
                </Text>
              ) : null}

              <Text style={styles.warningNote}>
                This PIN locks the screen; it does not encrypt the database. If you forget it,
                the only reset deletes every private calendar entry in the app. Existing backup
                files are not changed.
              </Text>

              <TouchableOpacity
                testID="private-pin-setup-submit"
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                onPress={handleSetup}
                disabled={busy}
                accessibilityRole="button">
                {busy ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Create PIN</Text>
                )}
              </TouchableOpacity>

              {Platform.OS === 'web' && (
                <Text style={styles.webNote}>
                  Web preview: this PIN is a deterrent, not encryption. Browser storage is
                  readable by anyone with access to this browser profile.
                </Text>
              )}
            </>
          ) : (
            <>
              <TextInput
                testID="private-pin-input"
                accessibilityLabel="PIN"
                style={styles.input}
                value={enteredPin}
                onChangeText={value => setEnteredPin(sanitizePin(value))}
                secureTextEntry
                autoComplete="off"
                keyboardType="number-pad"
                maxLength={PIN_MAX_LENGTH}
                editable={!busy}
                autoFocus
                placeholder="PIN"
                placeholderTextColor={theme.colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={handleUnlock}
              />

              {error ? (
                <Text testID="private-pin-error" style={styles.errorText}>
                  {error}
                </Text>
              ) : null}

              <TouchableOpacity
                testID="private-pin-unlock"
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                onPress={handleUnlock}
                disabled={busy}
                accessibilityRole="button">
                {busy ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Unlock</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                testID="private-pin-forgot"
                style={styles.forgotButton}
                onPress={handleForgot}
                disabled={busy}
                accessibilityRole="button">
                <Text style={styles.forgotText}>Forgot PIN?</Text>
              </TouchableOpacity>
            </>
          )}
          </Card>
          </ScrollView>
        </ScreenFade>
      </KeyboardAvoidingView>

      <DialogComponent />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flex: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: theme.colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    lockCircle: {
      width: 64,
      height: 64,
      borderRadius: radii.hero,
      backgroundColor: theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 18,
      borderWidth: 1,
      borderColor: theme.colors.primarySoft,
    },
    title: {
      ...typography.pageTitle,
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      ...typography.body,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 26,
    },
    label: {
      ...typography.micro,
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: theme.colors.secondary,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: radii.button,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 14,
    },
    errorText: {
      ...typography.caption,
      color: theme.colors.error,
      marginBottom: 14,
      textAlign: 'center',
    },
    warningNote: {
      ...typography.caption,
      lineHeight: 16,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 18,
    },
    webNote: {
      fontSize: 11,
      lineHeight: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 18,
      fontStyle: 'italic',
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: radii.button,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    destructiveButton: {
      backgroundColor: theme.colors.error,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: theme.colors.white,
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryButton: {
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    forgotButton: {
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    forgotText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    loading: {
      alignItems: 'center',
      gap: spacing.base,
      marginTop: 10,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
  });
