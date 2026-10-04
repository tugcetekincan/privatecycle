---
name: PrivateCycle Release
description: Cut a PrivateCycle release — version bump, pre-flight checks, tagging, and what the GitHub Actions workflow does. Use when asked to ship, release, tag a version, or check release health.
---

# PrivateCycle releases

Releases are tag-driven: pushing a `v*` tag runs
`.github/workflows/android-release.yml`, which builds a signed APK and creates
a GitHub Release with an auto-generated changelog.

## Pre-flight (all must pass)

```sh
npm ci
npm run typecheck
npm test
npm run smoke:web
```

Review `artifacts/screenshots/` — a release should not ship with visible
breakage that smoke didn't assert.

## Version bump

Update `expo.version` in `app.json` (currently `1.0.0`). Versions are not
wired to the tag automatically; keep them intentional. Commit the bump before
tagging.

## Tag and push

```sh
git tag v0.2.0
git push origin v0.2.0
```

Do not push tags unless the user explicitly asks — tagging publishes a public
release.

## What CI does

1. `npx expo prebuild --platform android`
2. `./gradlew generateCodegenArtifactsFromSchema` (required for New
   Architecture TurboModule headers — see CI comments)
3. decodes the keystore from `ANDROID_KEYSTORE_BASE64`
4. `assembleRelease` for `arm64-v8a` only, no Gradle build cache
5. uploads `dist/PrivateCycle-<tag>.apk` to a GitHub Release
6. changelog = commits since the previous tag (`git log prev..tag`)

Required repository secrets: `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## After the release

- Verify the APK asset exists on the release page and the changelog looks sane.
- If the build fails, read the failing step in Actions — the usual suspects are
  codegen ordering and dependency alignment when expo/RN versions changed.

## Version notes

- `app.json` `version` is displayed nowhere in the UI except About (which is
  currently hardcoded "Version 1.0.0" in `app/(tabs)/settings.tsx`) — update it
  when bumping, or better, read it from `expo-constants` if you touch that
  screen.
- Backup format version (`BackupService.BACKUP_VERSION`) is independent of app
  version. Bump it only when the backup JSON shape changes.
