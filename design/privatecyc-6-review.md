# PRIVATECYC-6 — empty and partial state review

**Review stage:** design decision made; option B implemented  
**Baseline:** `193da83` on `main`, 21 November 2026  
**Ticket:** Make empty and partial states actionable across all tabs

> **Decision: option B — Adaptive journal is selected and implemented.** The user
> chose B after reviewing the three alternatives. The app now uses the adaptive
> hierarchy; A and C remain in this document as design history.

## Diagnosis

The central problem is that the UI conflates **missing cycle history** with
**having nothing useful to show**. It also explains missing content without
giving an immediate next action or a precise requirement.

The original audit is historical. Calendar now offers “Start with my last
period”, “Log today”, and “Import a backup”. Those actions are a useful model
for the other tabs.

### Current issues

1. **Empty Overview looks like an incomplete dashboard.** Large bold dashes
   occupy the hero and statistics. The user must read several separate cards
   and then find Calendar themselves.
2. **One period is a partial state, not an empty state.** Three consecutive
   bleeding days give one period start, not three starts. The current cycle day
   and labelled standard estimate are usable, but an average cycle length
   cannot exist until a later period starts. “Track two periods” does not
   acknowledge what the user already recorded.
3. **Sparse moods are underrepresented.** Without period history, there are no
   phase summaries. Below five rated days, there is also no trend. The mood
   section therefore says “No mood patterns yet”, even though ratings exist.
   Feeling-only entries also need a useful presentation independent of phases.
4. **Today’s usable tips are hidden without a period.** `buildTodayTips` can
   generate advice from today’s headache or mood. Insights only renders those
   tips inside the branch requiring a recorded cycle. This is a presentation
   problem, not a need for more period data.
5. **“After a few cycles” is an inaccurate universal prerequisite.** Cycle,
   symptom, and mood cards have different eligibility rules. More logging does
   not guarantee that a meaningful contrast or dominant pattern will emerge.

Source locations: `app/(tabs)/track.tsx`, `app/(tabs)/insights.tsx`,
`services/CycleTrends.ts`, `services/MoodInsights.ts`,
`services/CycleNarrative.ts`, `services/TodayTips.ts`.

## Fresh current-app evidence

These are actual app captures using synthetic data in isolated browser
contexts, not personal exports. They document the **pre-implementation**
problem state and are kept as the baseline for comparison with option B. The
capture run covered empty, one-start, three-day sparse, five-rated-day, and
loaded demo histories, with zero captured console errors, page errors, or
failed requests.

**Start with the [annotated screenshot comparison](../artifacts/privatecyc-6-review/review-current-problems.png).**

- [Empty Overview](../artifacts/privatecyc-6-review/02-empty-overview-top.png):
  oversized unknown values and explanatory text with no direct entry action.
- [Three mood days, no periods](../artifacts/privatecyc-6-review/20-sparse-mood-card-element.png):
  symptom counts are present, but mood ratings are not shown; “a few more” does
  not explain that two more overall-rated days would enable the trend.
- [Five mood days, no periods](../artifacts/privatecyc-6-review/21-moodtrend-mood-card-element.png):
  the trend is visible, but “Trend + phases” promises phase content that is
  unavailable. The generic empty message does not explain the missing period
  context.
- [Insights with a headache logged today](../artifacts/privatecyc-6-review/19-sparse-insights-top.png):
  the phase placeholder appears instead of the already-supported headache tip.
- [One start, three period days](../artifacts/privatecyc-6-review/18-one-start-overview-top.png):
  the real cycle day and standard estimate are shown correctly; the remaining
  gaps need more contextual guidance.
- [Empty Calendar](../artifacts/privatecyc-6-review/01-empty-calendar-full.png)
  and [empty Settings](../artifacts/privatecyc-6-review/17-empty-settings-full.png):
  existing entry/import actions demonstrate that those historical findings
  have improved.

The absence of a qualifying pattern is not itself a defect. The issue is how
the UI explains that absence and whether independently useful content remains
visible. Full-content screenshots include extra canvas from viewport expansion;
this is a capture artifact, not a new layout finding.

## What actually becomes available

These are current display rules, not proposed changes to forecasting.

| Content | Requirement |
| --- | --- |
| Symptom frequency | A logged symptom; show the tracked-day denominator |
| Today’s symptom/mood tips | A supported symptom or mood in today’s log |
| Cycle-day anchor and initial forecast | One recorded period start; clearly label standard estimates |
| First measured cycle length / average / chart bar | Two separate period starts = one completed cycle |
| Cycle variation / cycle comparison | Three separate period starts = two completed cycles |
| Typical recorded period duration | Two completed recorded bleeding runs; exclude an active run |
| Mood trend | Five days with an overall mood rating within the last 60 days |
| Mood phase summaries | Mood entries that can be assigned an estimated phase |
| Symptom narrative | At least three symptom days assigned to phases, with a dominant phase share of at least 50% |
| Mood comparison narrative | At least two eligible phase summaries with at least two mood days each, non-null ratings, and a difference of at least 0.4 |

A **period start** is the first day of a separate period, not every bleeding
day. Feeling tags alone do not count toward the five overall-mood ratings for
the trend, but are still useful logged information.

## Selected direction — B, Adaptive journal

The app now follows B:

- Overview shows one warm start card when no period start exists, then reveals
  the real cycle day, phase track, counts and charts as history arrives.
- Symptoms keep their tracked-day denominator with or without phases; mood keeps
  ratings and feeling tags, a recent-entry list, and the exact five-ratings
  trend path.
- Insights Today renders log-backed tips independently of a current phase;
  empty patterns show precise eligibility instead of “after a few cycles”.
- Read-only actions hand off to Calendar through consumed-once route intents
  and reuse the existing day sheet, last-period mode and import confirmation.
- The phase guide stays general until a recorded start supplies a current
  phase.

The implementation lives in `app/(tabs)/track.tsx`,
`app/(tabs)/insights.tsx`, `app/(tabs)/index.tsx`,
`services/JournalReadiness.ts`, `services/MoodInsights.ts`,
`services/TodayTips.ts`, `services/DataService.ts` and
`services/CalendarIntent.ts`.

## Alternative designs

Open [the visual comparison board](privatecyc-6-alternatives.html). It contains
synthetic design examples, not screenshots of implemented behavior.

### A — Inline guidance

Keep the existing dashboard structure. Make unknown values quiet and readable,
add local requirements, and put Calendar actions beside the missing content.

- **Benefit:** familiar structure and the smallest visual change.
- **Trade-off:** repeated empty cards and actions still dominate a new journal.

### B — Adaptive journal — selected

Replace the unavailable cycle dashboard with one inviting start card. Keep
Symptoms and Mood independent. Show real recent entries immediately; reveal
each statistic or chart when it becomes meaningful. With one period start,
retain the real cycle day, the labelled standard forecast, and recorded period
days, alongside precise requirements for the remaining statistics.

- **Benefit:** clearest hierarchy; people see the value of what they have
  already logged.
- **Trade-off:** the layout grows as cycle history becomes available, so
  partial-state coverage matters more than a simple copy adjustment.

### C — Readiness map

Show an explicit list of what is available and what each next view needs.
Use counts for deterministic requirements, not a global completion score or a
promised countdown to discovering a pattern.

- **Benefit:** most explicit explanation of what logging enables.
- **Trade-off:** busier and more instructional; more state-specific UI.

## Shared behavior for every option

- Preserve usable symptom counts, mood ratings, and feeling tags without
  requiring period history.
- Show today’s log-backed tips independently of cycle phase availability.
- Use precise, contextual requirements; distinguish no entries, partial
  history, sufficient history without a qualifying pattern, and overdue cycles
  with an uncertain phase.
- Hand off to Calendar for entry and the existing backup-import flow.
  Overview and Insights remain read-only views with navigation actions.
- Keep the phase guide available as general information, clearly separate from
  the user’s estimated current phase.
- Only ask people to record what they know; a requirement is not a logging
  quota or a reason to invent past entries.

## Review and implementation ownership

GPT-6 Astra owns diagnosis, design direction, review, and verification.
`opencode-go/deepseek-v4.1-flash` writes mockup and implementation code.
App implementation starts after the user chooses a direction.

After implementation, review the diff and verify empty, one-start, sparse,
feeling-only, loaded, and overdue states; exercise Calendar/import handoffs;
run typecheck, regression tests, and web smoke; inspect light/dark and narrow
screenshots. Native import behavior requires a device check if changed.
Present the results for user verification, then commit and push, and update
PRIVATECYC-6 with the commit and verification evidence.

Baseline `npm run typecheck` passed during this review.
