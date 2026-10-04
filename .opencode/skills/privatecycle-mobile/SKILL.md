---
name: PrivateCycle Mobile
description: Build, install, drive and screenshot PrivateCycle on a real Android device or emulator — adb, Expo dev builds, Maestro flows, and the cases where web verification is not enough (date pickers, share sheet, file system, permissions, safe areas). Use when a change is native-only or web verification passed but the device behavior must be confirmed.
---

# PrivateCycle on Android

The web harness verifies logic and layout fast. Use this lane when the change
touches native behavior: `@react-native-community/datetimepicker`, share sheet,
document picker, file system backups, splash/icons, permissions, haptics,
safe-area/notch, performance, or anything the user reported "only on the
phone".

## Environment (this machine)

Android CLI tools are installed at `~/Android/Sdk`:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
adb version
```

Maestro is installed at `~/.maestro/bin/maestro` (add `~/.maestro/bin` to PATH).

An emulator is **not** available on this machine: `tcan` is not in the `kvm`
group and there is no passwordless sudo. Use a physical device, or ask the
user to run `sudo usermod -aG kvm $USER` (then re-login) before installing an
emulator system image.

## Physical device (USB or wireless debugging)

```sh
adb devices                     # confirm the device is authorized
adb -s <serial> shell getprop ro.product.model
```

Wireless (Android 11+): enable Developer options → Wireless debugging →
`adb pair <ip:pair-port>` then `adb connect <ip>:<port>`.

## Build and install

- One-time dev build (fast refresh after this):
  `npx expo run:android` — prebuilds `android/`, Gradle downloads NDK/CMake
  on first run, takes 10–30 min. The dev client (`expo-dev-client`, already a
  dependency) lets `npx expo start --dev-client` reload JS over the network —
  no reinstall per change.
- Release sanity check: the tagged GitHub Actions workflow builds the APK
  (`android-release.yml`). Don't reproduce that locally unless debugging CI.

## Screenshots and inspection

```sh
mkdir -p artifacts/screenshots
adb exec-out screencap -p > artifacts/screenshots/android-$(date +%H%M%S).png
adb logcat -d | tail -100            # app logs
```

At runtime, open the in-app Developer section (Settings) to seed/reset demo
data on device; the `?seed` URL mechanism is web-only.

## Maestro flows

`maestro/smoke.yaml` covers launch → tabs → track save. Run with:

```sh
~/.maestro/bin/maestro test maestro/          # all flows
~/.maestro/bin/maestro hierarchy              # inspect the view tree if selectors fail
```

Notes:
- Flows select by `id:`, which maps to React Native `testID` on Android. Keep
  testIDs stable (see the `privatecycle-verify` skill for the naming scheme).
- These flows have not been run on a device yet (none was attached when they
  were written). Treat the first run as a debugging session and adjust waits /
  selectors as needed.
- `maestro test --debug-output <dir>` and `takeScreenshot:` are useful.

## Emulator (only on a KVM-capable machine)

The AVD `privatecycle` is prepared once the system image is installed. Boot it
headless with `npm run emulator:start` (alias: `bash scripts/android-emulator.sh`);
it refuses to run without KVM access and waits for `sys.boot_completed`.
Override the name with `AVD_NAME=...`.

Raw commands, for reference:

```sh
sdkmanager --install "emulator" "system-images;android-35;google_apis;x86_64"
avdmanager create avd -n privatecycle -k "system-images;android-35;google_apis;x86_64" -d pixel_6
emulator -avd privatecycle -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect &
adb wait-for-device
```

Headless screenshots then work through the same adb commands.

## Comparing with web

Keep a web screenshot and a device screenshot side by side when verifying UI
changes: react-native-web differences (fonts, shadows, pickers) are expected,
but layout breakage and logic differences are real bugs.
