# AGENTS.md — PrivateCycle

PrivateCycle is a privacy-first period tracker for Android, iOS and web. All
data stays on-device in SQLite; users move data between devices only via JSON
backup files they export/import themselves. There is no backend and no account.

This file is the operating guide for agents working in this repository. Keep it
current when the workflow changes. Deeper runbooks live in
`.opencode/skills/` (load them with the `skill` tool):

| Skill | Use for |
| --- | --- |
| `privatecycle-verify` | Running/seeing/testing the app on web, seed data, screenshots, unit tests |
| `privatecycle-mobile` | Real Android device: builds, adb, Maestro, native-only behavior |
| `privatecycle-release` | Version bumps, tags, the GitHub Actions release pipeline |

## Stack

- Expo SDK 53 / React Native 0.79.6, **New Architecture enabled**, TypeScript strict
- `expo-router` v5 (file-based routes under `app/`), `@react-navigation` bottom tabs
- `expo-sqlite` (wa-sqlite on web), AsyncStorage for preferences only
- Playwright + Jest for verification; Maestro for device flows
- Node 18 locally (CI uses Node 20)

## Repository map

```
app/                    expo-router screens
  _layout.tsx           providers, migration gate, dev-seed gate, dev globals
  (tabs)/index.tsx      Calendar (month grid, day modal, predictions)
  (tabs)/track.tsx      Daily logging (period/flow/symptoms/mood)
  (tabs)/insights.tsx   Cycle stats from DataService.getInsights()
  (tabs)/settings.tsx   Preferences, backup UI, Developer section (__DEV__)
app.config.js           base identity from app.json + APP_VARIANT=dev overrides
components/             CustomDialog (+ demo)
hooks/                  useTheme, useDialog, useMigration, useAutoBackup,
                        useDevSeed (URL-seed handling), useFrameworkReady
services/               DataService (SQLite owner), BackupService,
                        AnalyticsService, DevSeedService, devGlobals
scripts/                web harness (see below), debug probe
__tests__/              Jest suites
maestro/                on-device smoke flow
.opencode/skills/       agent runbooks (keep updated)
.github/workflows/      ci.yml (per-push verify + APK artifact),
                        android-release.yml (tag-triggered signed APK)
plugins/withAndroidSigning.js   Expo config plugin for release signing
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | install exact deps (use after pulling changes) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest unit suite (`jest-expo` preset) |
| `npm run smoke:web` | headless end-to-end + screenshots (~1–3 min) |
| `npm run dev:web` | interactive app at http://localhost:8082 |
| `npm run debug:web` | headless probe: console, failed requests, DB check |
| `npm run e2e:mobile` | Maestro smoke flow on the dev variant (needs a connected device) |
| `npm run emulator:start` | Boot the headless AVD and wait until ready |
| `npm run prebuild:android:dev` | Regenerate `android/` for the dev app identity |
| `npm run android:dev` | Build/install/run the dev variant (coexists with the release app) |
| `npm run dev` | Expo dev server (native, no proxy) |

## Working with the user

**Clarify before building.** When a request is ambiguous, or the approach,
scope or trade-offs are not clearly defined, do not guess and charge ahead.
Brainstorm with the user first:

1. Restate the goal and constraints as you understand them (1–2 sentences).
2. Lay out the realistic options (usually 2–4), each with its pros and cons
   and what it means for this repository.
3. Give your recommendation and the reasoning behind it.
4. Ask which direction to take — use the `question` tool when available so
   the choice is explicit — and only then start the work.

This applies to decisions that are expensive to reverse: architecture,
dependencies, data or backup formats, migration strategies, UX flows, build
tooling. Small, obvious changes (typos, copy tweaks, local fixes) don't need
the ceremony; use judgment.

**Report results, get verification, then commit and push.** Finish by
explaining the achieved results: what changed, what you ran, and the evidence
(test output, screenshots). Ask the user to verify that everything looks
right. Only after they confirm, commit in small focused commits and push to
the current branch. Commit messages are one-liners — imperative and scoped
(`fix: …`, `feat: …`, `test: …`, `docs: …`), no body; the details belong in
the diff and the report. Don't leave verified work sitting uncommitted or
unpushed — once the user says yes, land it promptly. If the user has
explicitly pre-authorized committing, the round trip can be skipped. Tags and
releases always need explicit approval regardless — see
`privatecycle-release`.

## The verification ladder

Work down only as far as the change requires; stop when the risk is covered.

1. **`npm run typecheck`** — always.
2. **`npm test`** — any logic/service/hook change. Add or extend a test.
3. **`npm run smoke:web`** — any UI, data or flow change. It seeds
   deterministic data, walks all four tabs plus save/dialog flows, asserts
   stats, checks persistence across reload, and fails on console/page errors.
   **Review `artifacts/screenshots/`** before declaring success; passing
   assertions can hide visual breakage.
4. **`npm run dev:web` + browser/Playwright** — interactive debugging and
   reproduction. Use `http://localhost:8082` (see gotchas).
5. **Device (`privatecycle-mobile` skill)** — only when the change touches
   native-only behavior: date pickers, share sheet, document picker, file
   system, permissions, haptics, splash/icons, safe areas, performance.

Never use the GitHub release pipeline as a test loop; it exists for shipping.

## Web harness internals (why it is built this way)

- `scripts/dev-web.mjs` starts Expo on :8081 and a small reverse proxy on
  :8082 that adds `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`
  to **every** response, including the HTML document. Without those headers
  `expo-sqlite`'s web worker cannot run (`SharedArrayBuffer` needs a
  cross-origin-isolated document). Expo's dev server only applies them to
  Metro bundle responses, which is why the proxy exists.
- The proxy merges headers case-insensitively. Duplicate COOP/COEP headers
  block the SQLite worker with `net::ERR_BLOCKED_BY_RESPONSE` — do not
  "simplify" that logic away.
- Both scripts use `detached: true` + process-group kill and fail fast when
  ports are occupied, so no orphaned Metro servers.
- `services/DevSeedService.ts` generates deterministic demo data (126 days,
  26–30 day cycles) used by `?seed=1|force`, `?reset=1`, the Settings
  Developer section, tests and smoke.
- `services/devGlobals.ts` exposes `__privatecycle` (DataService,
  BackupService, seed helpers) on web dev builds for inspection from the
  console/Playwright. Production and native builds are unaffected.

## Conventions

**Data layer**
- `DataService` is the only module that talks to SQLite; screens and other
  services go through its static facade. The class instance owns one
  connection with lazy initialization.
- Schema changes are **append-only migrations** in `MIGRATIONS`
  (`services/DataService.ts`), each atomic, each bumping `PRAGMA user_version`.
  Never edit or reorder a shipped migration. Use `addColumnIfMissing` for new
  columns.
- Bulk writes go through `DataService.saveManyDailyData` (single transaction).
  Keep `BackupService.restoreFromBackup` on that path.

**Dates**
- Day keys are **local-time** `YYYY-MM-DD` from
  `DataService.formatDateKey`. Never use `toISOString().split('T')[0]` for day
  keys — it shifts dates in negative-offset timezones. `__tests__/dataService.test.ts`
  guards this.
- Period-start detection lives in SQL (`DATE(date, '-1 day')`) and in
  `AnalyticsService.getCyclePhase`; keep both consistent if you touch them.

**Backups**
- `BackupData` JSON is a public interface: users keep these files. Only add
  fields, keep old ones optional, bump `BACKUP_VERSION` for breaking shape
  changes, and extend `validateBackupData` (it must return a real boolean).
- Restore is destructive: clear + bulk insert.

**UI**
- Theming via `useTheme()` only; no hardcoded colors except the intentional
  period-pink accents and per-item palettes (`FLOW_LEVELS`, `MOODS`).
- Dialogs go through `useDialog()` (`showSuccess`, `showConfirm`, `showChoice`,
  …) and render `<DialogComponent />` once per screen.
- Add `testID` to every new interactive element, kebab-case
  (`area-element` / `area-element-{id}`). See the verify skill for the current
  inventory. Text selectors are a last resort.
- Platform differences belong either behind `Platform.OS` checks with a web
  fallback (see `track.tsx` date input and `BackupService`) or in
  platform-specific files.
- Dev-only UI/logic is wrapped in `__DEV__`.

**Tests**
- Put pure logic in services so it can be tested without a database.
- Native/Expo modules are mocked centrally in `jest.setup.js`.
- Existing suites: backup envelope/validation/restore, seed generator
  determinism, date keys, dialog component. Extend rather than duplicate.

**Scopes of change**
- Keep changes consistent with the surrounding style; no drive-by refactors.
- Do not edit `node_modules/`, `.expo/`, `artifacts/`, `android/`, `ios/`.
- Tags and releases always need explicit approval (`privatecycle-release`).

## Definition of done

A change is done when:

- `npm run typecheck` and `npm test` pass;
- `npm run smoke:web` passes and the screenshots show the intended result;
- no new console warnings/errors in the smoke output beyond the known noise
  (`shadow*` / `pointerEvents` deprecations, React DevTools banner);
- new UI has testIDs and new logic has tests;
- data/migration/backup changes are backward compatible (or the version bump
  and migration path are called out);
- the relevant skills/AGENTS.md are updated if the workflow itself changed;
- the achieved results were reported and the user verified them;
- once verified, the work is committed and pushed (see "Working with the
  user").

## CI

Every push to `main` runs `.github/workflows/ci.yml`: typecheck, Jest, then
two signed release APKs (arm64-v8a, release keystore) published to rolling
pre-releases, downloadable straight from the Releases page; workflow
artifacts are not used:

- `ci-latest` → `PrivateCycle.apk` — stable identity;
- `nightly` → `PrivateCycle-Nightly.apk` — `com.ncan.privatecycle.nightly`,
  installable next to the stable app to test with imported real data.

`workflow_dispatch` re-runs it on demand; pushes that only touch markdown,
`artifacts/`, `maestro/` or `.opencode/` are skipped; superseded runs are
cancelled. Cold builds are ~15 min; warm builds reuse cross-run caches
(Gradle home, `native-libs-v3`, `app-build-v1`, ccache) and are much faster.
Cache keys are versioned — **bump the version suffix when the cached paths
change**, because GitHub's cache entries are immutable and an old key would
keep restoring the old layout. Versioned release publishing stays tag-only
(see below).

## Releases

Tag-driven: `git tag vX.Y.Z && git push origin vX.Y.Z` triggers
`.github/workflows/android-release.yml` (signed APK published on GitHub
Releases, changelog generated from commits). Run the full verification ladder
and bump `expo.version` in `app.json` first. Details and secrets:
`privatecycle-release` skill.

## Environment & gotchas

- **Always use :8082 for the web app.** :8081 serves the same UI but without
  document isolation, so SQLite hangs. This is the single most common source
  of "the web build is broken".
- Expo/Metro first bundle takes ~30 s (≈2400 modules); subsequent rebuilds are
  fast. Timeouts already account for it.
- CI needs `./gradlew generateCodegenArtifactsFromSchema` before
  `assembleRelease` (New Arch header-only TurboModules); don't remove that
  step. `ci.yml` skips it only when the restored caches already contain every
  codegen dir (see the guard step); `android-release.yml` always runs it.
- `arm64-v8a` only in CI releases (speed), so x86 devices need a local build.
- Local Node is 18.x while CI uses 20; keep dependencies compatible with both.
- `@react-native-community/datetimepicker` has no web implementation — the
  Track screen renders an `<input type="date">` on web instead.
- **Three installable identities.** Stable `com.ncan.privatecycle` (release
  APK / `ci-latest`), local dev `com.ncan.privatecycle.dev` ("PrivateCycle
  Dev", blue icon, debug-signed dev client, `npm run android:dev`), and
  nightly `com.ncan.privatecycle.nightly` ("PrivateCycle Nightly", amber
  icon, release-signed, downloadable from the `nightly` pre-release). They
  coexist on one device with separate data sandboxes — import a backup
  exported from the stable app to test with realistic data. `android/`
  targets one identity at a time: `android:dev` refuses to run when it was
  generated for another package, and `npm run prebuild:android` switches
  back. Details in the `privatecycle-mobile` skill.
- This machine: Android SDK, platform-tools, NDK, CMake, Maestro and a
  `privatecycle` AVD are installed. `npm run emulator:start` boots the emulator
  headless (it re-execs through `sg kvm` when the session predates the group
  change); `npm run e2e:mobile` runs the validated Maestro flow. Stop with
  `adb emu kill`.
