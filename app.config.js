/**
 * Dynamic Expo config: the base identity lives in app.json. `APP_VARIANT`
 * selects an alternative app that can be installed alongside the real one:
 *
 *   dev     - "PrivateCycle Dev": debug-signed dev client for local work
 *             (Metro, fast refresh). See scripts/android-dev.sh.
 *   nightly - "PrivateCycle Nightly": signed APK uploaded to Actions on every
 *             push to main, standalone with the JS bundle embedded.
 *
 * Each variant has its own applicationId, so it coexists with the stable app
 * (and with the other variants) and has a separate data sandbox — importing
 * a backup there never touches real data.
 *
 * Manual production builds leave APP_VARIANT empty, keeping the base
 * identity from app.json.
 */
const VARIANTS = {
  dev: {
    name: 'PrivateCycle Dev',
    slug: 'privatecycle-dev',
    scheme: 'privatecycle-dev',
    package: 'com.ncan.privatecycle.dev',
    iconColor: '#4f7cff',
  },
  nightly: {
    name: 'PrivateCycle Nightly',
    slug: 'privatecycle-nightly',
    scheme: 'privatecycle-nightly',
    package: 'com.ncan.privatecycle.nightly',
    iconColor: '#f59e0b',
  },
};

const variant = VARIANTS[process.env.APP_VARIANT];

/**
 * Every CI/release build stamps ANDROID_VERSION_CODE (unix minutes) so the
 * versionCode strictly increases with each build and any APK installs over an
 * older one. Updater apps (Obtainium etc.) compare versionCodes, so without
 * this every build would look like the same version. Local builds keep
 * app.json's value (currently unset -> Expo's default).
 */
const withVersionCode = (config) => {
  const raw = process.env.ANDROID_VERSION_CODE;
  if (!raw) {
    return config;
  }
  const versionCode = Number(raw);
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`Invalid ANDROID_VERSION_CODE: ${raw}`);
  }
  return {
    ...config,
    android: {
      ...config.android,
      versionCode,
    },
  };
};

/**
 * Production stamps APP_VERSION from conventional commits (e.g. `1.1.3`)
 * so versionName matches the GitHub release. Nightlies reuse the latest
 * release version (app.json's version before the first release) and get a
 * fresh versionCode. Settings -> About reads it via expo-constants. Local
 * builds keep app.json's version.
 */
const withVersion = (config) => {
  const raw = process.env.APP_VERSION;
  if (!raw) {
    return config;
  }
  const version = raw.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid APP_VERSION: ${raw}`);
  }
  return { ...config, version };
};

module.exports = ({ config }) => {
  const base = withVersion(withVersionCode(config));

  if (!variant) {
    return base;
  }

  return {
    ...base,
    name: variant.name,
    // Distinct slug too: expo-dev-client derives its `exp+<slug>` deep-link
    // scheme from it, and sharing one would make `expo run:android` ambiguous
    // when another dev build is also installed.
    slug: variant.slug,
    scheme: variant.scheme,
    android: {
      ...base.android,
      package: variant.package,
      adaptiveIcon: {
        ...base.android?.adaptiveIcon,
        // Distinct launcher tint so the channels are never confused.
        backgroundColor: variant.iconColor,
      },
    },
    ios: {
      ...base.ios,
      bundleIdentifier: variant.package,
    },
  };
};
