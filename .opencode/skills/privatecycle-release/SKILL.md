---
name: PrivateCycle Release
description: Shipping PrivateCycle — the automatic per-commit release pipeline, conventional-commit version rules, pre-flight checks, and verifying or fixing a published release. Use when asked to ship, release, tag a version, or check release health.
---

# PrivateCycle releases

Releases are **automatic**: every push to `main` that CI does not skip
publishes a GitHub Release `vX.Y.Z` with both APKs attached —

- `PrivateCycle.apk` — stable identity (`com.ncan.privatecycle`);
- `PrivateCycle-Nightly.apk` — `com.ncan.privatecycle.nightly`, installs
  alongside the stable app for testing with imported real data.

`.github/workflows/ci.yml` is the only release path. Manual `v*` tags no
longer trigger builds (the workflow creates the tag itself via
`gh release create`), so do not push them.

## Version bump rules

`scripts/release-version.mjs` derives the version from the conventional
commits since the previous release tag:

- `feat: …` → minor (`v1.1.0` → `v1.2.0`);
- `feat!:` / `fix(scope)!:` / a `BREAKING CHANGE:` footer → major (`v2.0.0`);
- everything else — `fix:`, `ci:`, `docs:`, `chore:`, non-conventional —
  patch (`v1.1.1`).

Merge commits are ignored. Reruns reuse the version when the commit is
already released, and a version already tagged on another commit is skipped
in favour of the next patch. Print what the next push will release:

```sh
node scripts/release-version.mjs
```

## Pre-flight (all must pass before pushing)

```sh
npm ci
npm run typecheck
npm test
npm run smoke:web
```

Review `artifacts/screenshots/`. A push to `main` is a release, so treat
pre-flight as the release gate. Pushes that only touch `**.md`,
`.opencode/**`, `artifacts/**` or `maestro/**` are skipped by CI and do not
release.

## What CI does

1. checkout with full history; compute the version
2. typecheck + Jest
3. prebuild + `assembleRelease` (arm64-v8a) for the stable identity
4. prebuild + `assembleRelease` for the nightly identity
5. `gh release create` `vX.Y.Z` with both APKs and a changelog (commits since
   the previous release); a rerun edits the release and re-uploads instead.

Both APKs are stamped with the version (`versionName`, via `APP_VERSION`)
and a monotonically increasing `versionCode` (unix minutes, via
`ANDROID_VERSION_CODE`), so updater apps (Obtainium etc.) see every release.

Required repository secrets: `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## After a push

- Check the Actions run; the job summary links the published release.
- On the release: both assets present, changelog sane, version matches the
  bump level the commits imply.
- Usual build failures: codegen ordering and dependency alignment when
  expo/RN versions changed.

## Fixing a release

- Bad assets or notes: re-run that workflow run (Actions → the run →
  Re-run) — it republishes the same version and clobbers the assets.
- Wrong version, or a release that should not exist: deleting or re-tagging
  a published release (`gh release delete vX.Y.Z --cleanup-tag`) is
  destructive and needs explicit user approval; then re-run CI for the
  commit again.
- The old rolling `ci-latest` / `nightly` prereleases are retired;
  `releases/latest` and the per-version tags are the download surface now.

## Version notes

- Settings → About reads the real version via `expo-constants`: CI stamps
  `APP_VERSION` into the config, and `app.json`'s `version` is the
  local/fallback value.
- Backup format version (`BackupService.BACKUP_VERSION`) is independent of
  the app version. Bump it only when the backup JSON shape changes.
