# PRIVATECYC-4 — Learned bleeding duration and estimated phases

> **Status:** implemented on 2026-11-18. Verification: `npm run typecheck`,
> Jest 26 suites / 295 tests, and `npm run smoke:web` (0 failures, 0 console or
> page errors) passed; seeded, one-period, empty, overdue and dark-mode
> screenshots were reviewed. Physical-device notification delivery was not
> re-checked because no device/emulator was attached; planner dates are covered
> by unit tests.

Reviewed 2026-11-18 against `main` at `ef49561`. Related tickets: PRIVATECYC-3
(Done), PRIVATECYC-1 (Done), PRIVATECYC-24/25/37/40 (open).

## Verdict

- **PRIVATECYC-3 is resolved.** Settings no longer prints `28 / 5 / 14`; the
  cycle card was removed and cycle stats live in Overview. Its completion note
  is accurate: the only remaining gap it names — average period length shown
  separately from last-period length — is genuinely PRIVATECYC-4 work.
- **PRIVATECYC-4 is still valid**, but its original evidence is partly stale:
  Settings no longer claims 5 days. The live mismatch is:
  - Calendar predicted spans are always **7** days
    (`app/(tabs)/index.tsx:49-50`, `:132-140`).
  - The model's menstrual phase is always **6** days
    (`services/CycleModel.ts:105-106`), including the ovulation clamp and
    Overview phase track.
  - Overview shows only **last period** length, with no typical/average period
    and no sample size (`app/(tabs)/track.tsx:431-436`,
    `services/DataService.ts:694-727`).
  - Phase-guide day ranges are hardcoded `1–6 / 7–14 / 15–17 / 18–28+`
    (`services/CyclePhaseTips.ts:79,122,165,208`) and presented as if personal.
  - Overview's phase pill and Insights' Today badge say `Menstrual` without
    marking the timing as estimated (`app/(tabs)/track.tsx:338-346`,
    `app/(tabs)/insights.tsx:209-213`).
  - Phase-tip notifications use the fixed 6-day offset
    (`services/NotificationPlanner.ts:201-209`).
  - `services/AnalyticsService.ts` contains an unused period-length trend with
    UTC date parsing and a first-non-period-day query; it is not a usable base
    and should not be revived as-is.

The problem therefore still exists and the ticket's acceptance criteria are not
met. This roadmap finishes PRIVATECYC-3's out-of-scope item as part of it.

## Design decisions (recommended)

| Decision | Recommendation | Why |
| --- | --- | --- |
| Unit of learning | Consecutive `is_period` runs, not cycle starts | A run is the bleeding duration; a cycle start is a different concept |
| History window | Last 6 completed runs (reuse `CYCLE_HISTORY_LIMIT`) | Matches the existing cycle summary window; audit asked for 3–6 |
| Estimator | Median, rounded | Robust to one unusually short/long run |
| Minimum sample | 2 completed runs for a learned value | Same honesty rule as cycle average; one run is not a pattern |
| Fallback | Standard 5 days, explicitly labelled | Audit recommendation; avoids inventing a personal value |
| Range | Clamp estimate to 2–10 days | Prevents a one-day entry or a prolonged run from defining the predicted span |
| Active run | Run containing today; exclude from the estimate, show as in progress | Never treat an unfinished period as a final length |
| Recorded cycle phase | Use the actual run length for that cycle | A logged 7-day bleed must not be labelled follicular on day 7 |
| Predicted cycle phase | Use the learned estimate | There is no recorded run yet for a future cycle |
| Active-run phase display | `max(estimate, days so far)` for the phase track; today is still menstrual | Keeps the timeline stable while bleeding is ongoing |
| Ovulation/fertile math | **Do not feed period length into it** | Recorded bleeding is not proof of ovulation; luteal/ovulation stay on their current inputs |
| Overview display | 2×2 stats: Avg cycle, Typical period, Last period, Cycle variation | Distinguishes typical from last without returning to a Settings cycle card |
| Estimated labels | Overview: “Estimated {phase} phase”; Insights: “ESTIMATED {PHASE} · DAY N”; phase guide note | Timing is a model estimate, not a measured hormone phase |
| Phase-guide ranges | Derive from the current window when one exists; otherwise show “Varies” | Removes the false 28-day/6-day implication |
| Notifications | Use `window.menstrualPhaseDays` for phase-tip dates | One model, no separate 6-day assumption |
| Persistence | No schema or backup change | Period days already carry everything needed |

Medical wording/content review stays with **PRIVATECYC-37**. This ticket only
adds uncertainty labels and derived ranges; do not rewrite every tip sentence
here.

## Implementation slices

### Slice 1 — Pure bleeding model

New `services/BleedingModel.ts`:

- `buildBleedingRuns(periodDays: string[], todayKey: string): BleedingRun[]`
  - Group consecutive local day keys (`daysBetween(...) === 1`).
  - `BleedingRun = { start, end, days, active }`; `active` means the run
    includes `todayKey`.
- `summarizeBleedingRuns(runs, options): BleedingSummary`
  - `runDaysByStart: Record<string, number>` for phase classification.
  - `typicalDays: number | null` (median of last 6 completed runs; clamped
    2–10).
  - `typicalBasis: 'recorded' | 'standard'`, `sampleSize`.
  - `rawMedianDays: number | null`, `clamped: boolean`.
  - `lastPeriod: { days, start, end, active } | null`.
- Constants: `STANDARD_PERIOD_LENGTH_DAYS = 5`,
  `PERIOD_LENGTH_MIN_DAYS = 2`, `PERIOD_LENGTH_MAX_DAYS = 10`.
- No SQLite/Expo imports; use `services/dateKey.ts` only.

Tests: run grouping, active run, 0/1/2+ runs, median, clamp, one-day run,
prolonged run, history limit, unsorted input, DST-safe consecutive days.

### Slice 2 — Cycle math

- `services/CycleModel.ts`
  - `CycleModelInput` gains `periodRunDays?: Record<string, number>` and
    `periodLengthDays?: number`.
  - `CycleWindow` gains `menstrualPhaseDays: number` and
    `menstrualPhaseBasis: 'recorded' | 'estimated'`.
  - Recorded window: actual run length (active run uses
    `max(runDaysSoFar, estimate)`); predicted window: estimate; fallback 5.
  - `phaseForDateInWindows` and `ovulationPhaseBounds` use
    `window.menstrualPhaseDays`, not `MENSTRUAL_PHASE_DAYS`.
  - Keep `MENSTRUAL_PHASE_DAYS` only as a deprecated alias if external imports
    remain, or remove it and update all imports.
- `services/CycleTrends.ts`
  - `phaseTrackSegments` uses `window.menstrualPhaseDays`.
- `services/FertilityService.ts`
  - `FertilityStats.periodLength` carries `{ typicalDays, basis, sampleSize,
    lastPeriod }`.
  - Pass run data into `buildCycleModel`.
  - Do **not** use period length in ovulation/fertile calculations.
- `services/CyclePhaseTips.ts`
  - `getCurrentPhaseStatus` accepts optional run/period-length context and
    passes it to `buildCycleModel`.
  - Add `phaseDayRanges(window)` (or equivalent) for the phase guide; remove
    the static `dayRange` strings from `CYCLE_PHASE_TIPS` or make them dynamic
    at read time.
- `services/AnalyticsService.ts`
  - Update `loadCycleModel` to pass the same context so its phase buckets do
    not drift. Do not rely on its old period-length query.

Tests: update `fertilityService`, `cycleTrends`, `cyclePhaseTips`; add a 30-day
cycle with a 7-day bleed; short-cycle clamping; recorded vs predicted windows.

### Slice 3 — Data plumbing

- `services/DataService.ts`
  - Add `queryPeriodDays(db)` (all `is_period = 1` days, ascending).
  - Build the bleeding summary once per read; pass `runDaysByStart` and
    `typicalDays` into `buildCycleModel`, `summarizeSymptomPatterns`,
    `summarizeMoodByPhase`, and `computeFertilityForecast`.
  - `getInsights` returns `periodLength` instead of the ad-hoc
    `lastPeriodLength` (update `EMPTY_STATS` in Overview/Insights).
  - `getFertilityForecast` returns the same period-length summary.
  - `getNotificationStats` includes period run days/estimate.
- `services/SymptomInsights.ts` and `services/MoodInsights.ts`
  - Accept the period-run context in their options/signatures so phase splits
    use the same menstrual boundaries as the hero and calendar.
- `services/NotificationPlanner.ts`
  - `NotificationPlanInput` accepts period run days/estimate; phase-tip dates
    use `window.menstrualPhaseDays`.

Tests: DataService integration shape, symptom/mood phase split with a 7-day
run, notification phase-tip date with a 4-day typical period, empty and
one-period states.

### Slice 4 — UI

- Calendar (`app/(tabs)/index.tsx`)
  - Delete `PREDICTED_PERIOD_DAYS`; use
    `forecast.stats.periodLength.typicalDays` for each predicted start.
  - Add a note under `PERIOD ESTIMATES`:
    - recorded: “Predicted spans use the median of your last N periods (X days).”
    - standard: “Standard X-day estimate until two complete periods are logged.”
    - clamped: “Recent periods were outside the usual range; predicted span is
      capped at X days.”
  - New testID: `calendar-period-length-basis`.
- Overview (`app/(tabs)/track.tsx`)
  - 2×2 stat grid: `overview-avg-cycle`, `overview-typical-period`,
    `overview-last-period`, `overview-cycle-variation`.
  - `overview-typical-period` shows `—` until 2 complete runs (with the
    standard-estimate note), otherwise the typical value.
  - `overview-last-period` shows the latest run; active run adds
    “in progress” (testID `overview-last-period-note`).
  - Add sample/basis note (testID `overview-period-basis`): “Typical period is
    the median of your last N complete periods.”
  - Phase pill becomes “Estimated {phase} phase” (or an adjacent “Estimated”
    label); keep the existing `overview-phase-track` IDs.
- Insights (`app/(tabs)/insights.tsx`)
  - Today badge: `ESTIMATED {PHASE} · DAY N` when a phase exists; keep
    `PHASE UNCERTAIN · DAY N` behavior.
  - Phase guide range uses `phaseDayRanges(currentWindow)`; when no current
    window, show “Varies” instead of day numbers.
  - Add a note: “Phase timing is estimated from your logged cycles, not a
    hormone measurement.”
  - New testIDs: `insights-phase-day-range`, `insights-phase-estimate-note`.

### Slice 5 — Notifications, docs, verification

- Notification phase-tip copy: keep dates honest via `menstrualPhaseDays`.
  Decide whether titles say “Estimated …” here or leave wording to
  PRIVATECYC-37; recommendation is to add “Estimated” only where the current
  copy claims a phase without uncertainty, and keep discreet copy neutral.
- Update `AGENTS.md` (cycle model/period length), `design/DESIGN.md` (estimated
  phase labels), and the verify skill's testID/screenshot inventory.
- Run the full ladder:
  - `npm run typecheck`
  - `npm test` (new + updated suites)
  - `npm run smoke:web`; review seeded, one-period, empty, light/dark and
    short/long-run screenshots. The deterministic seed generates 4–6 day runs
    (`services/DevSeedService.ts:87`), so the predicted span should visibly
    become 5 instead of 7.
  - Device/emulator check for phase-tip notification dates and copy (web cannot
    verify actual delivery).

## Worked examples to review before implementation

| Case | Completed runs | Typical | Predicted span | Menstrual phase | Last period |
| --- | --- | --- | --- | --- | --- |
| Demo data | 5, 4, 6, 5, 4, 6 | 5 | 5 days | actual run length per cycle | 6 days |
| One complete run | 5 | — (standard 5) | 5 days, labelled standard | 5 days | 5 days |
| Active period | 5, 4, 5 + today day 3 | median of 5, 4, 5 = 5 | 5 days | current window at least 5 | 3 days, in progress |
| Short runs | 1, 1, 2 | 1 → capped at 2 | 2 days, capped note | 2 days | 2 days |
| Long run among typical | 12, 5, 5, 6 | 5 | 5 days | 12-day cycle gets 12 menstrual days | 12 days |
| Consistently long | 12, 12, 12 | 12 → capped at 10 | 10 days, capped note | 10 days | 12 days |
| No data | — | — | no forecast | no phase | — |
| 30-day cycle, 7-day run | 7, 5, 6 | 6 | 6 days | 7 days for that cycle | 7 days |

Explicit rule: the typical value is the median of the last six **complete**
runs, rounded, then clamped to 2–10. The active run never changes the typical
value until it is complete. Predicted calendar spans use the typical value;
recorded cycles use their actual run length for phase labels.

## Suggested commits

1. `feat: model bleeding runs and typical period length`
2. `feat: use learned period length in cycle phases and forecasts`
3. `feat: show typical period length and estimated phase labels`
4. `docs: document learned bleeding duration behavior` (only if the workflow
   docs change; tests can ride with their feature commits)

## Out of scope / dependencies

- **PRIVATECYC-24** (spotting separate from period starts): don't model
  spotting here; the run builder consumes `is_period` only and can later accept
  spotting flags.
- **PRIVATECYC-25** (cycle history + period-length trends): reuse
  `BleedingSummary`, but don't add a second trend chart in this ticket.
- **PRIVATECYC-37** (phase guidance evidence/wording): owns the full medical
  wording review. This ticket only adds estimated labels and derived ranges.
- **PRIVATECYC-40** (editable cycle assumptions): keep the model inputs
  overridable later; no settings UI here.
- **PRIVATECYC-21** (multi-day logging/correction): no dependency; current
  `is_period` row semantics are enough, and an explicit “period ended” marker
  can improve the active-run inference later.
- Backup format and schema are untouched, so old backups and devices continue
  to restore unchanged.

## Approval gates

1. Estimator: median of last 6 complete runs, clamp 2–10, fallback 5.
2. Active periods are excluded from the typical value and shown as “in
   progress”.
3. Recorded cycles use their actual run length for the menstrual phase;
   predicted cycles use the typical value.
4. Overview uses a 2×2 stat grid with both “Typical period” and “Last period”.
5. Phase-guide ranges are derived from the current window; no data shows
   “Varies”.
6. Phase-tip notifications use the learned length; wording stays with
   PRIVATECYC-37 except for an “Estimated” qualifier where needed.
