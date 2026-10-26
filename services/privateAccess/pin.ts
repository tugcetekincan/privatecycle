import * as Crypto from 'expo-crypto';

/**
 * PIN hashing helpers for the private-access gate. This is a UI lock, not
 * encryption: the intimacy data itself stays in the normal SQLite database.
 * The hash is salted and kept in SecureStore on native devices.
 */

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const PIN_PATTERN = /^\d{4,6}$/;

export interface PinConfig {
  version: 1;
  salt: string;
  hash: string;
}

export type Digest = (value: string) => Promise<string>;

export const isValidPin = (pin: string): boolean => PIN_PATTERN.test(pin);

export const createSalt = (): string => Crypto.randomUUID();

const defaultDigest: Digest = (value) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

export const hashPin = async (
  pin: string,
  salt: string,
  digest: Digest = defaultDigest
): Promise<string> => digest(`${salt}:${pin}`);

/** Length-safe, constant-time-ish comparison for hex digests. */
export const verifyPinHash = (actual: string, expected: string): boolean => {
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
};
