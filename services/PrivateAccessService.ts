import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createSalt,
  hashPin,
  isValidPin,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  PinConfig,
  verifyPinHash,
} from './privateAccess/pin';
import { getStoredValue, removeStoredValue, setStoredValue } from './privateAccess/storage';

/**
 * PIN gate for the private intimacy calendar.
 *
 * The PIN hash lives in SecureStore on native (AsyncStorage on web). This is a
 * UI lock, not encryption: someone with root/ADB or a copy of the SQLite file
 * can still read the rows. The threat model is a person holding an unlocked
 * phone, not offline forensics.
 *
 * There is deliberately no device-PIN/credential reset: a partner who knows
 * the phone PIN must not be able to bypass the app PIN. Forgetting this PIN
 * means deleting the private log (or restoring a backup that contains it).
 */

const PIN_KEY = 'private_access_v1';
const BACKUP_KEY = 'private_backup_enabled';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

let failedAttempts = 0;
let lockedUntil = 0;

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'locked' | 'missing'; retryAfterMs?: number };

export const loadPinConfig = async (): Promise<PinConfig | null> => {
  const raw = await getStoredValue(PIN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PinConfig>;
    if (
      parsed.version === 1 &&
      typeof parsed.salt === 'string' &&
      parsed.salt.length > 0 &&
      typeof parsed.hash === 'string' &&
      parsed.hash.length > 0
    ) {
      return { version: 1, salt: parsed.salt, hash: parsed.hash };
    }
  } catch {
    // Fall through to the explicit corruption error below.
  }

  throw new Error('Private access configuration is invalid');
};

const resetAttempts = () => {
  failedAttempts = 0;
  lockedUntil = 0;
};

export const PrivateAccessService = {
  async isConfigured(): Promise<boolean> {
    return (await loadPinConfig()) !== null;
  },

  async setupPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) {
      throw new Error(`PIN must be ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} digits`);
    }

    const salt = createSalt();
    const hash = await hashPin(pin, salt);
    const config: PinConfig = { version: 1, salt, hash };
    await setStoredValue(PIN_KEY, JSON.stringify(config));
    resetAttempts();
  },

  async verifyPin(pin: string): Promise<VerifyPinResult> {
    const now = Date.now();
    if (lockedUntil > now) {
      return { ok: false, reason: 'locked', retryAfterMs: lockedUntil - now };
    }

    const config = await loadPinConfig();
    if (!config) {
      return { ok: false, reason: 'missing' };
    }

    const hash = await hashPin(pin, config.salt);
    if (verifyPinHash(hash, config.hash)) {
      resetAttempts();
      return { ok: true };
    }

    failedAttempts += 1;
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockedUntil = now + LOCKOUT_MS;
      failedAttempts = 0;
      return { ok: false, reason: 'locked', retryAfterMs: LOCKOUT_MS };
    }

    return { ok: false, reason: 'invalid' };
  },

  /**
   * Verify the current PIN before replacing it. The UI validates the new PIN
   * format before calling this.
   */
  async changePin(currentPin: string, newPin: string): Promise<VerifyPinResult> {
    const result = await this.verifyPin(currentPin);
    if (!result.ok) return result;

    await this.setupPin(newPin);
    return { ok: true };
  },

  /** Forget the PIN and the backup preference. Caller decides about data. */
  async reset(): Promise<void> {
    await removeStoredValue(PIN_KEY);
    await AsyncStorage.removeItem(BACKUP_KEY);
    resetAttempts();
  },

  async isBackupEnabled(): Promise<boolean> {
    return (await AsyncStorage.getItem(BACKUP_KEY)) === '1';
  },

  async setBackupEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await AsyncStorage.setItem(BACKUP_KEY, '1');
    } else {
      await AsyncStorage.removeItem(BACKUP_KEY);
    }
  },
};

export { LOCKOUT_MS, MAX_ATTEMPTS };
