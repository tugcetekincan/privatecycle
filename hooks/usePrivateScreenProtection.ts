/**
 * Web/default no-op. Native builds resolve `usePrivateScreenProtection.native.ts`
 * and block screenshots/recents while the private calendar is mounted.
 */
export const usePrivateScreenProtection = (): void => {};
