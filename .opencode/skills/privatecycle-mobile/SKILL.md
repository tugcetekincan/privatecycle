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

An emulator **is available** on this machine: the SDK lives in `~/Android/Sdk`,
the AVD is named `privatecycle`, and `npm run emulator:start` boots it headless.
If the current session predates the `usermod -aG kvm`, the script re-executes
itself through `sg kvm`, so a reboot is nice-to-have but not required. Stop the
emulator with `adb emu kill`.

## Physical device (USB or wireless debugging)

```sh
adb devices                     # confirm the device is authorized
adb -s <serial> shell getprop ro.product.model
```

Wireless (Android 11+): enable Developer options → Wireless debugging →
`adb pair <ip:pair-port>` then `adb connect <ip>:<port>`.

## Build and install

Local dev builds use a **separate app identity** (defined in `app.config.js`,
enabled by `APP_VARIANT=dev`) so they install alongside the release app and
never touch real data:

| | Release app | Dev variant |
| --- | --- | --- |
| applicationId | `com.ncan.privatecycle` | `com.ncan.privatecycle.dev` |
| Label / scheme | PrivateCycle / `myapp` | PrivateCycle Dev / `privatecycle-dev` |
| Icon tint | pink | blue |

```sh
npm run prebuild:android:dev   # once, and after native config/dependency changes
npm run android:dev            # build + install + start Metro (dev client)
```

- `android:dev` refuses to run when `android/` was generated for the base
  package; regenerate with `prebuild:android:dev` first — never let a dev
  build install over the production package.
- Day-to-day JS-only changes: keep Metro running (`npm run dev`) and reload
  the dev app; no rebuild needed.
- Emulator ABI only (faster):
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 npm run android:dev`.
- Switching back to the base identity locally:
  `npm run prebuild:android` then `npm run android` (or plain
  `npx expo run:android` after regenerating).
- Backup testing: export a backup in the release app (share sheet → Files),
  then import it in the dev app via Settings → Import Backup. On the emulator
  `adb push backup.json /sdcard/Download/` also works.
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

`maestro/smoke.yaml` covers launch → tabs → track save → back to calendar,
targeting the dev variant. Validated on the `privatecycle` AVD via
`npm run e2e:mobile` (≈1 min). Run with:

```sh
npm run e2e:mobile                      # = ~/.maestro/bin/maestro test maestro/
~/.maestro/bin/maestro hierarchy        # inspect the view tree if selectors fail
```

Notes:
- The flow dismisses the dev client's one-time "Continue" onboarding overlay
  and waits up to 90 s for the JS bundle after a cold start.

Notes:
- Flows select by `id:`, which maps to React Native `testID` on Android. Keep
  testIDs stable (see the `privatecycle-verify` skill for the naming scheme).
- Long screens need `scrollUntilVisible` before tapping elements below the
  fold; `track-mood-*` and `track-save-button` are examples.
- `takeScreenshot:` writes to `~/.maestro/tests/<timestamp>/<flow>/takeScreenshot/`.
  Copy the file into `artifacts/screenshots/` when you need it as evidence.
- First build on a fresh checkout takes ~20 min (`npx expo run:android
  --variant release --no-bundler`); later builds are incremental. Use
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64` to build only the
  emulator ABI.

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
