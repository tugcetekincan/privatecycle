import {
  hashPin,
  isValidPin,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  verifyPinHash,
} from '@/services/privateAccess/pin';
import { PrivateAccessService } from '@/services/PrivateAccessService';

describe('private PIN helpers', () => {
  it('accepts 4-6 digit PINs and rejects everything else', () => {
    expect(PIN_MIN_LENGTH).toBe(4);
    expect(PIN_MAX_LENGTH).toBe(6);
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });

  it('salts before hashing and compares equal hashes safely', async () => {
    const digest = jest.fn(async (value: string) => `hash(${value})`);

    const hash = await hashPin('1234', 'salt', digest);

    expect(digest).toHaveBeenCalledWith('salt:1234');
    expect(hash).toBe('hash(salt:1234)');
    expect(verifyPinHash(hash, 'hash(salt:1234)')).toBe(true);
    expect(verifyPinHash(hash, 'hash(salt:9999)')).toBe(false);
    expect(verifyPinHash('short', 'longer')).toBe(false);
  });
});

describe('PrivateAccessService', () => {
  beforeEach(async () => {
    await PrivateAccessService.reset();
  });

  it('has no PIN until one is configured', async () => {
    expect(await PrivateAccessService.isConfigured()).toBe(false);
    expect(await PrivateAccessService.verifyPin('1234')).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('sets up and verifies a PIN', async () => {
    await PrivateAccessService.setupPin('1234');

    expect(await PrivateAccessService.isConfigured()).toBe(true);
    expect(await PrivateAccessService.verifyPin('1234')).toEqual({ ok: true });
    expect(await PrivateAccessService.verifyPin('9999')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects an invalid PIN at setup time', async () => {
    await expect(PrivateAccessService.setupPin('123')).rejects.toThrow();
    expect(await PrivateAccessService.isConfigured()).toBe(false);
  });

  it('locks out after five wrong attempts', async () => {
    await PrivateAccessService.setupPin('1234');

    for (let attempt = 1; attempt < 5; attempt++) {
      expect(await PrivateAccessService.verifyPin('0000')).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }

    const fifth = await PrivateAccessService.verifyPin('0000');
    expect(fifth).toMatchObject({ ok: false, reason: 'locked' });
    if (!fifth.ok && fifth.reason === 'locked') {
      expect(fifth.retryAfterMs).toBeGreaterThan(0);
    }

    const sixth = await PrivateAccessService.verifyPin('1234');
    expect(sixth).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('changes the PIN only with the current PIN', async () => {
    await PrivateAccessService.setupPin('1234');

    expect(await PrivateAccessService.changePin('0000', '5678')).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(await PrivateAccessService.verifyPin('1234')).toEqual({ ok: true });

    expect(await PrivateAccessService.changePin('1234', '5678')).toEqual({ ok: true });
    expect(await PrivateAccessService.verifyPin('1234')).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(await PrivateAccessService.verifyPin('5678')).toEqual({ ok: true });
  });

  it('stores the backup preference and clears it on reset', async () => {
    expect(await PrivateAccessService.isBackupEnabled()).toBe(false);
    await PrivateAccessService.setBackupEnabled(true);
    expect(await PrivateAccessService.isBackupEnabled()).toBe(true);

    await PrivateAccessService.reset();

    expect(await PrivateAccessService.isBackupEnabled()).toBe(false);
    expect(await PrivateAccessService.isConfigured()).toBe(false);
  });
});
