/**
 * Dynamic Expo config: the base identity lives in app.json, and
 * `APP_VARIANT=dev` switches to a distinct "PrivateCycle Dev" app.
 *
 * The dev variant installs alongside the release app on the same device:
 * a different applicationId means a different signature requirement and a
 * separate data sandbox, so local builds, backup imports and seed/reset
 * never touch the real app's data.
 *
 * Usage (prefer the npm scripts, see package.json):
 *   APP_VARIANT=dev npx expo prebuild --platform android --clean
 *   APP_VARIANT=dev npx expo run:android
 *
 * CI and release builds never set APP_VARIANT, so they keep the base
 * identity from app.json.
 */
const IS_DEV = process.env.APP_VARIANT === 'dev';

module.exports = ({ config }) => {
  if (!IS_DEV) {
    return config;
  }

  return {
    ...config,
    name: 'PrivateCycle Dev',
    // Distinct slug too: expo-dev-client derives its `exp+<slug>` deep-link
    // scheme from it, and sharing it would make `expo run:android` ambiguous
    // when a base-identity dev build is also installed.
    slug: 'privatecycle-dev',
    scheme: 'privatecycle-dev',
    android: {
      ...config.android,
      package: 'com.ncan.privatecycle.dev',
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        // Distinct launcher tint so the two apps are never confused.
        backgroundColor: '#4f7cff',
      },
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.ncan.privatecycle.dev',
    },
  };
};
