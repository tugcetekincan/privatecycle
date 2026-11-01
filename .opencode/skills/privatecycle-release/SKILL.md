---
name: PrivateCycle Release
description: Shipping PrivateCycle — automatic nightly prereleases, manual production releases, conventional-commit version rules, pre-flight checks, and verifying or fixing a published release. Use when asked to ship, release, tag a version, or check release health.
---

# PrivateCycle releases

There are two entry points, sharing `.github/workflows/build-android.yml`:

| Workflow | Trigger | Output |
| --- | --- | --- |
| **Nightly** (`ci.yml`) | Every push to `main` | Prerelease `vX.Y.Z-nightly-YYMMDD-<sha>` with `Privatecycle-X.Y.Z-nightly-<sha>.apk` |
| **Publish new version** (`publish.yml`) | Manual, on `main` | Release `vX.Y.Z` with `Privatecycle-X.Y.Z.apk` |

Each run verifies and builds exactly one signed arm64 APK. Nightlies use
`com.ncan.privatecycle.nightly` and install alongside production
(`com.ncan.privatecycle`). Nightlies never advance or move production tags.

## Getting a nightly

Open **Releases** and pick the newest prerelease, or **Actions → Nightly →
the successful run** (its summary links the release). Download
`Privatecycle-X.Y.Z-nightly-<sha>.apk`. `X.Y.Z` is the latest production
version, the tag's date is UTC and the SHA is the commit the APK was built
from. Every push gets its own tag, so same-day builds do not collide;
rerunning a run edits that release and replaces its asset. Prereleases are
never marked "Latest", so the Releases page still promotes production.

## Publishing production

1. Verify the intended `main` commit (pre-flight below).
2. Open **Actions → Publish new version → Run workflow**.
3. Leave the branch on **main** and run it; other branches skip the job.
4. Once successful, download `Privatecycle-X.Y.Z.apk` from the new GitHub
   Release.

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

Nightlies reuse the latest production versionName (or `app.json` before the
first release) and never advance it. Their tag appends
`-nightly-YYMMDD-<sha>` and the APK name appends `-nightly-<sha>`.
`release-version.mjs` ignores `*-nightly-*` tags when finding the base
version, so prereleases can never leak into the next production bump.
`scripts/release-metadata.mjs` owns the tag/filename format for both variants
and is unit-tested.

Every build stamps a fresh build-time `versionCode` (unix minutes via
`ANDROID_VERSION_CODE`) so APKs can update earlier installations of the same
identity.

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
5. Publish the release: a nightly prerelease or the production release.

Required repository secrets (unchanged): `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Both callers grant `contents: write`; the nightly caller only uses it to
create or update its own prerelease tag.

## After a build

- Nightly: follow the summary's release link; check the tag, the versioned
  APK asset and that the release is marked **Pre-release**. It installs as
  PrivateCycle Nightly.
- Production: follow the summary's release link; check
  `Privatecycle-X.Y.Z.apk`, changelog, version bump and that it is **not**
  marked pre-release. Nightlies are separate prereleases.
- Usual build failures: codegen ordering and dependency alignment when
  Expo/RN versions change.

## Fixing a release

- Failed build: rerun the workflow run for that commit.
- Bad published assets or notes: with explicit approval, rerun the original
  run (Nightly or **Publish new version**). The tag is derived from the
  commit, so a rerun edits the same release and replaces its APK.
- Wrong version, or a release that should not exist: deleting or re-tagging
  a published release (`gh release delete <tag> --cleanup-tag`) needs
  explicit approval; then rerun the workflow for that commit.
- Historical releases and their assets are left as-is. Nightlies are
  cumulative prereleases, one per commit.

## Version notes

- Settings → About reads the real version via `expo-constants`; `APP_VERSION`
  stays set during both prebuild and bundling. `app.json` is the local fallback.
- Backup format version (`BackupService.BACKUP_VERSION`) is independent of
  the app version. Bump it only when the backup JSON shape changes.
