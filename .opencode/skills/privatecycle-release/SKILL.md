---
name: PrivateCycle Release
description: Shipping PrivateCycle — automatic nightly Actions artifacts, manual production releases, conventional-commit version rules, pre-flight checks, and verifying or fixing a published release. Use when asked to ship, release, tag a version, or check release health.
---

# PrivateCycle releases

There are two entry points, sharing `.github/workflows/build-android.yml`:

| Workflow | Trigger | Output |
| --- | --- | --- |
| **Nightly** (`ci.yml`) | Every push to `main` | Actions artifact containing `privatecycle_nightly_YYMMDD.apk` |
| **Publish new version** (`publish.yml`) | Manual, on `main` | GitHub Release `vX.Y.Z` with only `PrivateCycle.apk` |

Each run verifies and builds exactly one signed arm64 APK. Nightlies use
`com.ncan.privatecycle.nightly` and install alongside production
(`com.ncan.privatecycle`). Nightlies never create tags or releases.

## Getting a nightly

Open **Actions → Nightly → the successful run → Artifacts**. Download
`privatecycle_nightly_YYMMDD` and unzip `privatecycle_nightly_YYMMDD.apk`.
The date is UTC, captured at the start of the build. Artifacts are retained
for 30 days, and the run summary links the download. Same-day builds have
the same filename but belong to separate runs. Rerunning a run replaces its
artifact. There are no path exclusions or cancellation of earlier runs.

## Publishing production

1. Verify the intended `main` commit (pre-flight below).
2. Open **Actions → Publish new version → Run workflow**.
3. Leave the branch on **main** and run it; other branches skip the job.
4. Once successful, download `PrivateCycle.apk` from the new GitHub Release.

The workflow computes the version automatically, builds only production,
and publishes a changelog covering all commits since the previous release.
Production runs are serialized, and nightly pushes cannot cancel them.
The selected commit stays pinned even if more commits land during the build.
Manual `v*` tags do not trigger builds; the workflow creates the tag via
`gh release create`.

## Version bump rules

`scripts/release-version.mjs` derives the production version from all
conventional commits since the previous release tag:

- `feat: …` → minor (`v1.1.0` → `v1.2.0`);
- `feat!:` / `fix(scope)!:` / a `BREAKING CHANGE:` footer → major (`v2.0.0`);
- everything else — `fix:`, `ci:`, `docs:`, `chore:`, non-conventional —
  patch (`v1.1.1`).

Merge commits are ignored. Reruns reuse the version when the commit is
already released, and a version tagged on another commit is skipped in
favour of the next patch. Preview the next manual release locally:

```sh
node scripts/release-version.mjs
```

The production version is stamped into the APK (`APP_VERSION`) and used as
the release tag. If tags change during the build and alter the computed
version, publishing fails rather than attaching an APK with a mismatched
version; rerun to rebuild it.

Nightlies reuse the latest release's versionName (or `app.json` before the
first release), without advancing or tagging it. Every build stamps a fresh
build-time `versionCode` (unix minutes via `ANDROID_VERSION_CODE`) so APKs
can update earlier installations of the same identity.

## Pre-flight

Before pushing, follow the verification ladder in `AGENTS.md` for the scope
of the change. Before publishing production, run the full checks:

```sh
npm ci
npm run typecheck
npm test
npm run smoke:web
```

Review `artifacts/screenshots/`. Workflow-only edits should also be checked
with `actionlint`; do not use the publishing workflow as a test loop.

## Shared Android build

1. Checkout with full history; determine APK name, version and versionCode.
2. Typecheck + Jest.
3. Prebuild the selected identity; restore variant-specific app outputs and
   shared native-library/Gradle/ccache caches.
4. Generate missing New Architecture codegen, then `assembleRelease`.
5. Upload the nightly Actions artifact **or** publish the production release.

Required repository secrets (unchanged): `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
The nightly caller has only `contents: read`; production grants
`contents: write` for publication.

## After a build

- Nightly: verify the run's artifact contains the correctly dated APK and
  installs as PrivateCycle Nightly.
- Production: follow the summary's release link; check `PrivateCycle.apk`,
  changelog and version bump. New releases contain no nightly APK.
- Usual build failures: codegen ordering and dependency alignment when
  Expo/RN versions change.

## Fixing a release

- Failed build: rerun the workflow run for that commit.
- Bad published assets or notes: with explicit approval, rerun the original
  **Publish new version** run. It reuses the version, edits notes and
  replaces `PrivateCycle.apk`.
- Wrong version, or a release that should not exist: deleting or re-tagging
  a published release (`gh release delete vX.Y.Z --cleanup-tag`) needs
  explicit approval; then rerun the production workflow for that commit.
- Historical releases and their assets are left as-is. New nightlies live
  only in Actions artifacts, not rolling prereleases or versioned releases.

## Version notes

- Settings → About reads the real version via `expo-constants`; `APP_VERSION`
  stays set during both prebuild and bundling. `app.json` is the local fallback.
- Backup format version (`BackupService.BACKUP_VERSION`) is independent of
  the app version. Bump it only when the backup JSON shape changes.
