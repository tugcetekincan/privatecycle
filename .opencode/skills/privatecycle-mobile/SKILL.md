---
name: PrivateCycle Mobile
description: Build, install, drive and screenshot PrivateCycle on a real Android device or emulator — adb, Expo dev builds, Maestro flows, and the cases where web verification is not enough (share sheet, file system, permissions, safe areas). Use when a change is native-only or web verification passed but the device behavior must be confirmed.
---

# PrivateCycle on Android

The web harness verifies logic and layout fast. Use this lane when the change
touches native behavior: share sheet, document picker, file system backups,
splash/icons, permissions, haptics, safe-area/notch, performance, or anything
the user reported "only on the phone".

## Environment (this machine)

On the Linux host the Android SDK is at `$HOME/Android/Sdk` and the
`privatecycle` AVD is already installed:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
adb version
```

On the Mac host the SDK lives at
`/opt/homebrew/share/android-commandlinetools`, Maestro is at
`~/.maestro/bin/maestro`, Node 22 is at `/opt/homebrew/opt/node@22/bin`, and
there is **no local AVD** — use a physical device over USB or wireless
debugging.

```sh
# Mac
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

## Physical device (USB or wireless debugging)

```sh
adb devices                     # confirm the device is authorized
adb -s <serial> shell getprop ro.product.model
```

Wireless (Android 11+): enable Developer options → Wireless debugging →
`adb pair <ip:pair-port>` then `adb connect <ip>:<port>`.

## Build and install

The app can exist in **three identities** (defined in `app.config.js`); each
has its own applicationId and data sandbox, so they coexist on one device:

| | Stable app | Dev (local) | Nightly (CI) |
| --- | --- | --- | --- |
| applicationId | `com.ncan.privatecycle` | `com.ncan.privatecycle.dev` | `com.ncan.privatecycle.nightly` |
| Label / scheme | PrivateCycle / `myapp` | PrivateCycle Dev / `privatecycle-dev` | PrivateCycle Nightly / `privatecycle-nightly` |
| Icon tint | pink | blue | amber |
| Signed with | release key (CI) | debug key | release key (CI) |
| JS source | embedded | Metro (dev client) | embedded |
| How to get it | newest release | `npm run android:dev` | same release as stable |

Local dev builds:

```sh
npm run prebuild:android:dev   # once, and after native config/dependency changes
npm run android:dev            # build + install + start Metro (dev client)
```

For testing features against imported real data **without a local build**,
download `PrivateCycle-Nightly.apk` from the newest release
(`releases/latest`, rebuilt on every push to `main`). Export a backup from
the stable app (share sheet → Files), then import it in the nightly app via
Settings → Import Backup. On the emulator
`adb push backup.json /sdcard/Download/` also works.

- `android:dev` refuses to run when `android/` was generated for another
  package; regenerate with `prebuild:android:dev` first — never let a dev
  build install over the production package.
- Day-to-day JS-only changes: keep Metro running (`npm run dev`) and reload
  the dev app; no rebuild needed.
- Emulator ABI only (faster):
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 npm run android:dev`.
- Switching back to the base identity locally:
  `npm run prebuild:android` then `npm run android` (or plain
  `npx expo run:android` after regenerating).
- Release sanity check: CI builds both APKs and publishes the versioned
  release on every push (`ci.yml`); don't reproduce that locally unless
  debugging CI.

## Screenshots and inspection

```sh
mkdir -p artifacts/screenshots
adb exec-out screencap -p > artifacts/screenshots/android-$(date +%H%M%S).png
adb logcat -d | tail -100            # app logs
```

At runtime, open the in-app Developer section (Settings) to seed/reset demo
data on device; the `?seed` URL mechanism is web-only.

## Notifications

Local notifications are scheduled by `expo-notifications`; there is no push
backend. After changing the plugin or dependency, rebuild the dev app:

```sh
npm run prebuild:android:dev
npm run android:dev
```

Then Settings → Notifications → **Send test notification**. It should arrive
in about 5 seconds. Check the Android 13+ permission prompt on first enable,
that the master switch turns off and cancels pending notifications, and that a
tap opens Calendar or Insights. Disable battery optimization if the emulator
delays a scheduled reminder; delivery is best-effort.

## Maestro flows

`maestro/smoke.yaml` covers launch → Calendar day-modal entry → Overview → Insights → Settings → back to calendar,
targeting the dev variant. Validated on the `privatecycle` AVD via
`npm run e2e:mobile` (≈1 min). `maestro/private-calendar.yaml` stops and
relaunches the app, then covers the private calendar: PIN setup or unlock with
`1234`, lock, re-unlock, and leaves the calendar open for the FLAG_SECURE check
below. Run with:

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
  fold; `day-modal-save` and `day-modal-symptom-*` are examples.
- `takeScreenshot:` writes to `~/.maestro/tests/<timestamp>/<flow>/takeScreenshot/`.
  Copy the file into `artifacts/screenshots/` when you need it as evidence.
- First build on a fresh checkout takes ~20 min (`npx expo run:android
  --variant release --no-bundler`); later builds are incremental. Use
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64` to build only the
  emulator ABI.
- The private calendar blocks screenshots and the recents preview on native
  (`expo-screen-capture` + FLAG_SECURE). To check it, leave the calendar open
  after `maestro/private-calendar.yaml`, run
  `adb exec-out screencap -p > artifacts/screenshots/private-secure.png`, and
  inspect the file: the app area should be black/blank. Web has no equivalent,
  and the web smoke deliberately skips this check.

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
