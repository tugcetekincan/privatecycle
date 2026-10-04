#!/usr/bin/env bash
# Boot the PrivateCycle headless Android emulator and wait until it is ready.
#
# Prerequisites (one-time):
#   sudo usermod -aG kvm $USER   # then reboot / log out and back in
#   sdkmanager --install "emulator" "system-images;android-35;google_apis;x86_64"
#   echo no | avdmanager create avd -n privatecycle \
#     -k "system-images;android-35;google_apis;x86_64" -d pixel_6
#
# Usage: npm run emulator:start   (or AVD_NAME=other bash scripts/android-emulator.sh)
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

AVD_NAME="${AVD_NAME:-privatecycle}"
EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"

if [ ! -x "$EMULATOR" ]; then
  echo "ERROR: emulator not installed at $EMULATOR" >&2
  echo "Install with: sdkmanager --install 'emulator' 'system-images;android-35;google_apis;x86_64'" >&2
  exit 1
fi

if [ ! -w /dev/kvm ]; then
  # The user may already be in the kvm group without a fresh login session
  # (supplementary groups are read at login). Re-exec through sg so the
  # emulator gets the group without requiring a reboot.
  if getent group kvm | cut -d: -f4 | tr ',' '\n' | grep -qx "${USER:-$(id -un)}"; then
    echo "KVM not in this session's groups yet; re-executing via 'sg kvm'..."
    quoted_args=""
    for arg in "$@"; do quoted_args="$quoted_args $(printf '%q' "$arg")"; done
    # shellcheck disable=SC2086
    exec sg kvm -c "bash $(printf '%q' "$0")$quoted_args"
  fi
  echo "ERROR: /dev/kvm is not writable by this shell." >&2
  echo "The admin action was: sudo usermod -aG kvm $USER" >&2
  echo "A reboot (or full log-out/log-in) is required for the group to take effect." >&2
  exit 1
fi

if ! "$EMULATOR" -list-avds | grep -qx "$AVD_NAME"; then
  echo "ERROR: AVD '$AVD_NAME' not found. Create it with:" >&2
  echo "  echo no | avdmanager create avd -n $AVD_NAME -k 'system-images;android-35;google_apis;x86_64' -d pixel_6" >&2
  exit 1
fi

if "$ADB" devices | grep -q "^emulator-"; then
  echo "An emulator is already running:"
  "$ADB" devices
else
  echo "Booting $AVD_NAME (headless, software GPU)..."
  nohup "$EMULATOR" -avd "$AVD_NAME" \
    -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect > "/tmp/emulator-$AVD_NAME.log" 2>&1 &
  echo "Log: /tmp/emulator-$AVD_NAME.log"
fi

"$ADB" wait-for-device
echo "Waiting for boot to complete (first boot can take a few minutes)..."
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  sleep 3
done

echo "Emulator ready:"
"$ADB" devices
