import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  usePreventScreenCapture,
} from 'expo-screen-capture';

/**
 * Native-only protection for the unlocked private calendar. Android's
 * FLAG_SECURE blanks screenshots and the recents preview; iOS also gets a
 * blurred app-switcher overlay. Web cannot enforce either.
 */
export const usePrivateScreenProtection = (): void => {
  usePreventScreenCapture('private-calendar');

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    enableAppSwitcherProtectionAsync(0.8).catch(() => {
      // Older iOS versions may not support the overlay; blocking captures is
      // still active via usePreventScreenCapture.
    });

    return () => {
      disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, []);
};
