import * as SecureStore from 'expo-secure-store';

/**
 * Native storage for the private-access PIN configuration. SecureStore keeps
 * the salted PIN hash encrypted with the platform keystore.
 */

export const getStoredValue = (key: string): Promise<string | null> => {
  return SecureStore.getItemAsync(key);
};

export const setStoredValue = (key: string, value: string): Promise<void> => {
  return SecureStore.setItemAsync(key, value);
};

export const removeStoredValue = (key: string): Promise<void> => {
  return SecureStore.deleteItemAsync(key);
};
