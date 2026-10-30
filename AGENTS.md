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

- Expo SDK 58 / React Native 0.88.1, **New Architecture (the only option since SDK 55)**, TypeScript strict
- `expo-router` v8 (file-based routes under `app/`), `useFocusEffect` re-exported by `expo-router` (no direct `@react-navigation/*` imports)
- `expo-sqlite` (wa-sqlite on web), AsyncStorage for preferences only
- `expo-notifications` for local, on-device reminders (no push backend)
- Playwright + Jest for verification; Maestro for device flows
- Node 22 locally and in CI (SDK 58 requires >=22.13; npm runs with `legacy-peer-deps` — see `.npmrc`)

## Repository map

```
app/                    expo-router screens
  _layout.tsx           providers, migration gate, dev-seed gate, dev globals
  (tabs)/index.tsx      Calendar (month grid, day modal, period + fertility forecast)
  (tabs)/track.tsx      Overview (read-only cycle stats, symptom + mood trends;
                        route stays /track for stability)
  (tabs)/insights.tsx   Today card, data-derived pattern cards, phase tips
  (tabs)/settings.tsx   Preferences, backup UI, Privacy section, Developer section (__DEV__)
  notifications.tsx     Reminder setup: privacy, voice, per-reminder toggles
  private/index.tsx     PIN-protected intimacy calendar (outside the tab bar)
app.config.js           base identity from app.json + APP_VARIANT=dev overrides
components/             CustomDialog (+ demo), MoodPicker (faces + tags),
                        PrivateGate (PIN gate), PrivateCalendar (month + day sheet)
components/ui/          ScreenHeader, SectionHeader, Card/GradientCard, Pill,
                        IconTile, SettingsRow, EmptyState, PrimaryButton,
                        ScreenFade (the shared design-language primitives)
design/                 DESIGN.md (authoritative visual language), tokens.ts,
                        and the HTML design studies
hooks/                  useTheme, useDialog, useMigration, useAutoBackup,
                        useDevSeed (URL-seed handling), useFrameworkReady,
                        useNotifications (scheduling + tap routing),
                        useNotificationSettings (local preference loader),
                        usePrivateScreenProtection (native screenshot block)
services/               DataService (SQLite owner), BackupService,
                        NotificationService (local delivery + permissions),
                        NotificationPlanner (pure reminder dates/copy),
                        NotificationSettings (stored preferences),
                        AnalyticsService, DevSeedService, CycleModel
                        (shared cycle windows, ovulation + phase math),
                        FertilityService (forecast built on CycleModel),
                        CyclePhaseTips (phase tips + current phase + Today focus),
                        CycleTrends (cycle length summary + phase track segments),
                        CycleNarrative (insight pattern cards),
                        TodayTips (log-backed tips for the Today card),
                        SymptomInsights (symptom/phase math), Symptoms
                        (shared catalog), PrivateAccessService (PIN gate),
                        IntimacyService (private calendar summaries),
                        privateAccess/ (PIN hash + platform storage), devGlobals
scripts/                web harness (see below), debug probe,
                        make-notification-icon.mjs (96px Android icon),
                        release-version.mjs (per-commit release version)
__tests__/              Jest suites
maestro/                on-device smoke flow
.opencode/skills/       agent runbooks (keep updated)
.github/workflows/      ci.yml (per-push verify + versioned release)
plugins/withAndroidSigning.js   Expo config plugin for release signing
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | install exact deps (use after pulling changes) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest unit suite (`jest-expo` preset) |
| `node scripts/release-version.mjs` | version the next push to `main` releases |
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
explicitly pre-authorized committing, the round trip can be skipped. Releases
are automatic (every pushed commit), but manually deleting, retagging or
overwriting a published release still needs explicit approval — see
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
  BackupService, NotificationSettingsService, PrivateAccessService, seed
  helpers) on web dev builds for inspection from the console/Playwright.
  Production and native builds are unaffected.

## Real-data previews (local export)

Estimates and new UI are easiest to judge against a real history. `local-data/`
is a gitignored drop box for a user export — the app's normal
`cycle_backup_<timestamp>.json`, accepted by `BackupService.validateBackupData`.

- Drop the newest export as `local-data/latest.json`. Other `*.json` files in
  that folder are fine; `latest.json` is the convention agents and ad-hoc
  scripts read. `cycle_backup_*.json` is ignored anywhere in the repo as a
  safety net, but never commit it: it is personal health data.
- Skip the Settings → Import file picker and load it through dev globals while
  `npm run dev:web` is running (Playwright against :8082):

  ```js
  const backup = JSON.parse(fs.readFileSync('local-data/latest.json', 'utf8'));
  await page.evaluate((data) => window.__privatecycle.BackupService.restoreFromBackup(data), backup);
  await page.reload();
  ```

  Restore replaces the cycle data and, only when the file contains
  `data.intimateData`, the private log; the PIN is untouched. That is
  intended: the web DB becomes a copy of the exported device.
- Go back to demo data with `__privatecycle.seedDemoData({ force: true })` or
  Settings → Load Demo Data. Smoke runs and their screenshots keep using the
  deterministic seed, never this file.
- Prefer exporting **without** the private calendar unless the change needs
  it, and don't copy the file into commits, fixtures or tracked screenshots.
  `artifacts/` and `test-results/` are already ignored.

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
- A day with nothing tracked has **no row**: `saveTodayData`, `saveMoodData`
  and `saveManyDailyData` delete/skip fully cleared days (see `dayHasContent`),
  and migration v4 removes the empty rows older versions left behind. The
  calendar's grey "No Period" mark follows row presence, so never re-add an
  empty-row upsert.
- Mood detail is additive: `mood_valence` (1-5, 0 = unset) and `mood_tags`
  (`[{id, level}]`, level 1-3). The legacy `mood` string mirrors the first tag
  so the calendar and insights keep working. Feeling ids/labels live in
  `MOOD_OPTIONS` (`services/MoodTags.ts`); the phase summary and trend series
  are pure helpers in `services/MoodInsights.ts`. Phases come from the shared
  cycle model (`services/CycleModel.ts`), the same source as the calendar's
  ovulation dates — never reintroduce fixed day-14 thresholds. The calendar
  day modal's mood picker auto-saves mood-only via `DataService.saveMoodData`
  so unsaved period/symptom edits are never overwritten.

**Dates**
- Day keys are **local-time** `YYYY-MM-DD` from
  `DataService.formatDateKey`. Never use `toISOString().split('T')[0]` for day
  keys — it shifts dates in negative-offset timezones. `__tests__/dataService.test.ts`
  guards this.
- Period-start detection lives in SQL (`DATE(date, '-1 day')`); the shared
  cycle model (`CycleModel.buildCycleModel`) must consume that same ascending
  list so the calendar and Insights stay aligned.
- Ovulation/fertile-window forecasting and cycle phases are pure math in
  `services/CycleModel.ts` (day helpers in `services/dateKey.ts`), exposed
  through `DataService.getFertilityForecast()`. Recorded ovulation beats the
  prediction for the cycle it belongs to. The Overview phase buckets and
  Insights phase tips derive from the same model, so calendar, Overview and
  Insights cannot disagree about an ovulation date.

**Backups**
- `BackupData` JSON is a public interface: users keep these files. Only add
  fields, keep old ones optional, bump `BACKUP_VERSION` for breaking shape
  changes, and extend `validateBackupData` (it must return a real boolean).
- `BackupService` still imports the classic file API from
  `expo-file-system/legacy`: SDK 54 replaced the module's default export with
  the object-oriented `File`/`Directory` API. The legacy entry point still
  ships in SDK 58, so migrating the backup folder code is a standalone
  follow-up, not part of an SDK bump.
- Restore is destructive: clear + bulk insert for cycle data. The private
  calendar is replaced only when the backup contains `data.intimateData`;
  otherwise the device's private log is preserved.
- Private calendar backups are opt-in (`Include in backups`, default off):
  `data.intimateData` is optional, and `metadata.includesPrivateData` /
  `metadata.privateDays` describe it. Normal backups keep version `1.0.0`.

**Private calendar**
- `intimate_data` is its own table (migration v5); a row means activity was
  logged for that local day. Never merge it into `daily_data`, the main
  calendar, Insights, notifications, seed data or `AnalyticsService`.
- Reached only through Settings → Privacy → Private calendar (`/private`,
  outside the tabs). `PrivateAccessService` owns the 4–6 digit PIN: salted
  SHA-256 hash in SecureStore on native / AsyncStorage on web, 5 failed
  attempts → 30s lockout. There is no device-PIN reset; `Forgot PIN?` deletes
  the private log. The gate locks on AppState background. Native screenshots
  and recents are blocked by `usePrivateScreenProtection`; web is a deterrent
  only.
- `Clear All Data` deletes both tables and resets the PIN. The dev
  `Reset Demo Data` clears both tables but keeps the PIN; `Load Demo Data`
  wipes both too. Private calendar data is never generated by `DevSeedService`.
- No main-calendar marker and no Insight. The outside labels stay neutral;
  the explicit "Intimacy" title renders only after unlock.

**Notifications**
- Local-only via `expo-notifications`: there is no push server and no
  account. `NotificationService` owns permissions, Android channels,
  scheduling and tap routing; `NotificationPlanner` is pure and computes the
  dates/copy from `CycleModel` + `BackupService` state.
- All reminders are opt-in behind the master switch on `/notifications`.
  Default to discreet lock-screen copy; detailed wording is an explicit
  choice. Never include private-calendar data or PIN state in a notification.
- Reschedule on app foreground and after cycle/backup changes. Keep the
  rolling horizon below iOS's 64 pending-notification limit; cycle reminders
  cover three predicted cycles and logging reminders two weeks.
- Web has no reliable local scheduling: `/notifications` shows an explanatory
  notice, and the root hook is a no-op.
- No `SCHEDULE_EXACT_ALARM` permission; Android delivery is best-effort and
  may be delayed by battery optimization. Copy is a wellness estimate, never
  medical advice or contraception.

**UI**
- Read `design/DESIGN.md` before adding or changing UI. Use
  `design/tokens.ts` (spacing, radii, typography, shadows) and the
  `components/ui/*` primitives instead of one-off card/header styles.
- Daily entry lives only in the Calendar day modal. Overview (`track.tsx`) and
  Insights are read-only; do not bring the old inline Track form back.
- The Calendar grid is a soft card with rounded day cells; tracked non-period
  days are a tiny muted dot, not a grey fill. Today is a transparent ring so a
  period fill remains visible.
- Theming via `useTheme()` only; no hardcoded colors except the intentional
  period-pink accents and per-item palettes (`FLOW_LEVELS`, `MOODS`).
- Dialogs go through `useDialog()` (`showSuccess`, `showConfirm`, `showChoice`,
  …) and render `<DialogComponent />` once per screen.
- Add `testID` to every new interactive element, kebab-case
  (`area-element` / `area-element-{id}`). See the verify skill for the current
  inventory. Text selectors are a last resort.
- New screens must use the design language doc's new-feature checklist:
  ScreenHeader, SectionHeader, Card tokens, literal uppercase labels, semantic
  phase colors, honest empty states and sample sizes.
- Platform differences belong either behind `Platform.OS` checks with a web
  fallback (see `BackupService`) or in platform-specific files.
- Write uppercase headings as literal strings, never with
  `textTransform: 'uppercase'`: React Native Android applies the transform
  with the device locale, so Turkish devices render dotted İ (`FEELİNGS`).
- Dev-only UI/logic is wrapped in `__DEV__`.

**Tests**
- Put pure logic in services so it can be tested without a database.
- Native/Expo modules are mocked centrally in `jest.setup.js`.
- Existing suites: backup envelope/validation/restore, seed generator
  determinism, date keys, dialog + mood picker components, mood tags/insights,
  fertility forecast + cycle phases, cycle phase tips, cycle trends + phase
  tracks, cycle narrative cards, today tips, symptom patterns, notification
  settings/planner/screen, private-access PIN/lockout, intimacy summaries and
  private backup sections. Extend rather than duplicate.

**Scopes of change**
- Keep changes consistent with the surrounding style; no drive-by refactors.
- Do not edit `node_modules/`, `.expo/`, `artifacts/`, `android/`, `ios/`.
- Deleting or overwriting published releases/tags needs explicit approval
  (`privatecycle-release`); the per-push releases themselves are automatic.

## Definition of done

A change is done when:

- `npm run typecheck` and `npm test` pass;
- `npm run smoke:web` passes and the screenshots show the intended result;
- no new console warnings/errors in the smoke output beyond the known noise
  (`shadow*` / `pointerEvents` deprecations, React DevTools banner);
- new UI has testIDs and new logic has tests;
- notification changes are checked on a device/emulator for the permission
  prompt and actual delivery (web only verifies the notice);
- data/migration/backup changes are backward compatible (or the version bump
  and migration path are called out);
- the relevant skills/AGENTS.md are updated if the workflow itself changed;
- the achieved results were reported and the user verified them;
- once verified, the work is committed and pushed (see "Working with the
  user").

## CI

Every push to `main` runs `.github/workflows/ci.yml`: typecheck, Jest, then
builds two signed release APKs (arm64-v8a, release keystore) and attaches
both to **one versioned GitHub Release** — the Releases page is the download
source; workflow artifacts are not used:

- `PrivateCycle.apk` — stable identity;
- `PrivateCycle-Nightly.apk` — `com.ncan.privatecycle.nightly`, installable
  next to the stable app to test with imported real data.

The version comes from `scripts/release-version.mjs`, which analyzes the
conventional commits since the previous release tag: `feat:` bumps minor, a
`!` in the header or a `BREAKING CHANGE:` footer bumps major, everything else
bumps patch — so every released push advances the version, and rerunning CI
for an already-released commit reuses it. The version is stamped into both
APKs as `versionName` (`APP_VERSION` via `app.config.js`; Settings → About
reads it back) and used as the release tag.

Every build also stamps a build-time `versionCode` (unix minutes, wired
through `ANDROID_VERSION_CODE` in `app.config.js`), so each APK is
installable over the previous one — updater apps that compare versionCodes
rely on this.

`workflow_dispatch` re-runs it on demand; pushes that only touch markdown,
`artifacts/`, `maestro/` or `.opencode/` are skipped; superseded runs are
cancelled — the cancelled commits are simply folded into the next release
(window and bump both come from git history). Cold builds are ~15 min; warm
builds reuse cross-run caches (Gradle home, `native-libs-v4`, `app-build-v2`,
ccache) and are much faster. Cache keys are versioned — **bump the version
suffix when the cached paths change**, because GitHub's cache entries are
immutable and an old key would keep restoring the old layout.

## Releases

Automatic: every push to `main` that CI does not skip publishes `vX.Y.Z`
with both APKs (see "CI" above). Run the full verification ladder before
pushing — a push is a release. Manually pushing `v*` tags no longer triggers
anything; don't. Bump rules, verification and recovery details:
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
  codegen dir (see the guard step).
- `arm64-v8a` only in CI releases (speed), so x86 devices need a local build.
- Node 22.13+ is required locally (CI uses 22); Node 18 breaks Metro with
  `configs.toReversed is not a function`.
- The private calendar adds native `expo-secure-store`, `expo-crypto` and
  `expo-screen-capture`; notifications add `expo-notifications` (local-only,
  no push service). Run `npm run prebuild:android:dev` and
  `npm run android:dev` after changing any of them. Web resolves the
  AsyncStorage storage adapter, the no-op screen-protection hook and the
  notifications notice, so the web smoke still runs; screenshots there are not
  protected.
- **Three installable identities.** Stable `com.ncan.privatecycle` (release
  APK from the newest release), local dev `com.ncan.privatecycle.dev`
  ("PrivateCycle Dev", blue icon, debug-signed dev client,
  `npm run android:dev`), and nightly `com.ncan.privatecycle.nightly`
  ("PrivateCycle Nightly", amber icon, release-signed, attached to every
  release). They
  coexist on one device with separate data sandboxes — import a backup
  exported from the stable app to test with realistic data. `android/`
  targets one identity at a time: `android:dev` refuses to run when it was
  generated for another package, and `npm run prebuild:android` switches
  back. Details in the `privatecycle-mobile` skill.
- Android tooling on the Linux host: SDK at `$HOME/Android/Sdk`
  (platform-tools, NDK, CMake, build-tools), AVD `privatecycle` exists;
  `npm run emulator:start` boots it headless. Maestro is installed. On the Mac
  host the SDK lives at `/opt/homebrew/share/android-commandlinetools` and
  there is no local AVD, so use a physical device over adb.
  `adb` must be on PATH, e.g.
  `export ANDROID_HOME=$HOME/Android/Sdk`.
