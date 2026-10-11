/**
 * Dynamic Expo config: the base identity lives in app.json. `APP_VARIANT`
 * selects an alternative app that can be installed alongside the real one:
 *
 *   dev     - "PrivateCycle Dev": debug-signed dev client for local work
 *             (Metro, fast refresh). See scripts/android-dev.sh.
 *   nightly - "PrivateCycle Nightly": release build published by CI on every
 *             push to main (rolling `nightly` pre-release), standalone with
 *             the JS bundle embedded.
 *
 * Each variant has its own applicationId, so it coexists with the stable app
 * (and with the other variants) and has a separate data sandbox — importing
 * a backup there never touches real data.
 *
 * CI and release builds never set APP_VARIANT, so they keep the base identity
 * from app.json.
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

module.exports = ({ config }) => {
  if (!variant) {
    return config;
  }

  return {
    ...config,
    name: variant.name,
    // Distinct slug too: expo-dev-client derives its `exp+<slug>` deep-link
    // scheme from it, and sharing one would make `expo run:android` ambiguous
    // when another dev build is also installed.
    slug: variant.slug,
    scheme: variant.scheme,
    android: {
      ...config.android,
      package: variant.package,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        // Distinct launcher tint so the channels are never confused.
        backgroundColor: variant.iconColor,
      },
    },
    ios: {
      ...config.ios,
      bundleIdentifier: variant.package,
    },
  };
};
