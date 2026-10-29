#!/usr/bin/env bash
#
# Run the PrivateCycle Dev variant (com.ncan.privatecycle.dev) on a connected
# device. The variant is defined in app.config.js and installs alongside the
# release app with its own data sandbox.
#
# Regenerating android/ is only needed when it does not yet target the dev
# package (first run, or after `npm run prebuild:android` for the base app).
# The guard below refuses to build the wrong identity instead of silently
# installing over the production package.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# Homebrew installs the SDK into its own prefix on macOS; fall back to it when
# the Linux-style default is missing.
if [ ! -d "$ANDROID_HOME/platform-tools" ] && [ -d /opt/homebrew/share/android-commandlinetools/platform-tools ]; then
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
fi

DEV_PACKAGE="com.ncan.privatecycle.dev"

if [ ! -d android ]; then
  echo "android/ is missing; generating the dev native project..."
  APP_VARIANT=dev npx expo prebuild --platform android --clean --no-install
fi

if ! grep -q "applicationId '${DEV_PACKAGE}'" android/app/build.gradle; then
  echo "android/ is currently generated for the production package."
  echo "Regenerate it for the dev variant first:"
  echo
  echo "  npm run prebuild:android:dev"
  echo
  exit 1
fi

APP_VARIANT=dev npx expo run:android "$@"
