import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Web/default storage for the private-access PIN configuration.
 *
 * The native build resolves `storage.native.ts` instead and keeps the salted
 * PIN hash in SecureStore/Keystore. On web there is no SecureStore; the PIN is
 * a deterrent for a shared browser, not a security boundary.
 */

export const getStoredValue = (key: string): Promise<string | null> => {
  return AsyncStorage.getItem(key);
};

export const setStoredValue = (key: string, value: string): Promise<void> => {
  return AsyncStorage.setItem(key, value);
};

export const removeStoredValue = (key: string): Promise<void> => {
  return AsyncStorage.removeItem(key);
};
