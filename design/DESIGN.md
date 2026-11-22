# PrivateCycle design language

**Soft editorial wellness.** Calm, warm, data-literate and private by default.
The app should feel like a thoughtful paper journal, not a clinical dashboard
and not a generic collection of settings cards.

This document is the source of truth for the visual layer. The HTML boards are
the visual reference; this file explains the rules and the tokens so future
features can be built without re-inventing the look.

Visual references:

- `design/overview-insights-redesign.html` — Overview + Insights
- `design/app-language-design.html` — Calendar card + Settings
- `design/onboarding-alternatives.html` — onboarding directions; Tidemark (B)
  is the selected first-run flow
- `design/privatecyc-6-alternatives.html` — empty/partial journal states;
  Adaptive journal (B) is selected and implemented

## 1. Product decisions baked into the visual language

These are intentional product choices, not styling accidents:

- **Calendar is the only daily-entry path.** Overview and Insights are
  read-only. Do not bring the old inline Track form back.
- **Overview** (route `/track`) is the data view: Cycle, Symptoms and Mood.
- **Insights** is the interpretation: today's focus, the user's own patterns,
  and phase tips.
- **"Days logged" is context, not a metric tile.** It appears as a sample-size
  caption where it qualifies a percentage ("126 tracked days").
- **Cycle variation and the six-cycle length trend** replaced the old
  days-logged tile.
- **Insights always shows its sample size** and never claims causality.
- **A personal pattern is matched to today's phase first**; when there is no
  match, it falls back to "usually show up in your … phase" rather than
  implying it is happening now.
- **The full app uses one language**, including the Calendar, Settings, the
  day modal, MoodPicker, dialogs and the private gate/calendar.
- **Motion is quiet.** Keep the existing month/modal transitions; the only new
  motion is a subtle screen fade.

## 2. Character

- Warm neutral canvas, crisp white surfaces, blush-tinted hero areas.
- Oversized numerals and confident headings; small uppercase labels for
  orientation.
- Rounded geometry (16–18px cards, 999px pills) and diffuse, low-opacity depth.
- Generous breathing room; no dense dashboard grids.
- Semantic color instead of decoration: pink/period, green/follicular,
  teal/ovulation, amber/luteal, blue/today.
- Editorial, human copy. Short sentences. No alarmist or diagnostic language.

## 3. Color

### Core palette

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#fafafa` | `#121212` | Screen canvas |
| `surface` | `#ffffff` | `#1e1e1e` | Cards, sheets, tab bar |
| `surfaceTint` | `#fff8fb` | `#241a1e` | Hero / Today card |
| `primary` | `#e91e63` | `#e91e63` | Brand, period, main action |
| `primarySoft` | `#fce4ec` | `#3b1b28` | Icon tiles, selected chips |
| `primaryWeak` | `#f8bbd0` | `#5a2437` | Chart bars, predicted fill |
| `text` | `#333333` | `#ffffff` | Primary text |
| `textSecondary` | `#666666` | `#b3b3b3` | Body, captions, meta |
| `border` | `#f0f0f0` | `#333333` | Card borders, dividers |
| `success` | `#4caf50` | `#4caf50` | Follicular, regular, positive |
| `successSoft` | `#e8f5e9` | `#1f3a24` | Success tint |
| `warning` | `#ff9800` | `#ff9800` | Luteal, variable, caution |
| `warningSoft` | `#fff3e0` | `#3a2a14` | Warning tint |
| `error` | `#f44336` | `#f44336` | Destructive actions |
| `teal` | `#009688` | `#009688` | Ovulation, fertility |
| `tealSoft` | `#e0f2f1` | `#183b37` | Fertile window, pattern tint |
| `today` | `#0077b6` | `#4fa8e0` | Today ring and today pill |
| `todaySoft` | `#e3f2fd` | `#142a3a` | Today pill background |

### Phase semantics

Small colored text uses the semantic ink tokens (`primaryText`, `successText`,
`warningText`, `tealText`): deeper shades in light mode, lighter shades in dark
mode. Keep original phase colors for bars, dots and fills. This preserves the
palette while keeping labels readable on soft surfaces.

Use these consistently in the calendar, charts, legends and Insights:

| Phase | Color |
| --- | --- |
| Menstrual | `primary` pink |
| Follicular | `success` green |
| Ovulation | `teal` |
| Luteal | `warning` amber |

Never communicate phase or state with color alone. Pair it with a label,
number, dot position or icon. Phase colors are data, not decoration.

Phase timing is an estimate derived from the user's log, not a measured hormone
phase. Label it as estimated in the Overview pill and Insights Today badge, and
show phase-guide day ranges as typical for the user (or “Days vary” without
data). The menstrual phase follows the recorded bleeding run when one exists;
predicted cycles use the learned/standard bleeding span.

### Tint rules

- Hero and Today cards use a soft two-stop gradient from `surface` to
  `surfaceTint`/`primarySoft`. Ordinary cards stay flat `surface`.
- Tinted rows (Today focus, personal pattern, notices) use a soft background
  plus a tinted 1px border. Keep them quieter than the hero.
- Do not use saturated fills for large surfaces. Pink is a highlight, not a
  background wash.

## 4. Typography

System font stack. No custom font asset in this pass.

| Role | Size / line height / weight | Notes |
| --- | --- | --- |
| Display numeral | 44 / 48 / 800 | Cycle day, hero numbers; tight tracking |
| Page title | 28 / 32 / 800 | Screen titles only |
| Page subtitle | 12 / 17 / 500 | One line under the title |
| Today headline | 22 / 26 / 800 | Insights Today card |
| Card title | 18 / 22 / 800 | Section cards |
| Stat value | 26 / 30 / 800 | 3-column stat row |
| Row title | 13 / 18 / 700 | Settings rows, lists |
| Body | 13 / 19 / 400 | Card body, descriptions |
| Caption | 11 / 15 / 500 | Meta, denominators, notes |
| Micro / eyebrow | 9–11 / 14 / 800 | Uppercase labels, letter-spacing 0.8 |
| Section label | 11 / 14 / 800 | Uppercase, letter-spacing 0.8 |

Rules:

- Write uppercase text as literal strings. Never use `textTransform:
  'uppercase'`; Android applies it with the device locale (Turkish `İ`).
- Headings use 800, not `bold`/700, to get the editorial contrast.
- Avoid more than four type sizes in one card.
- Body copy should never be smaller than 11px at 1x; 12–13 is preferred.

## 5. Space, shape, depth

### Spacing scale

`4 · 6 · 8 · 10 · 12 · 16 · 18 · 20 · 24 · 32`

- Screen horizontal padding: **20**
- Card gap: **10–12**
- Card padding: **16–18** (calendar card 14, hero/Today 18)
- Section header margin: **20 top / 8 bottom**
- Card row vertical padding: **10–12**
- Touch target: **at least 44×44**

### Radii

| Radius | Use |
| --- | --- |
| 8 | Small chips, small controls |
| 10 | Row icon tiles, month chevrons |
| 11–12 | Calendar day cells, focus rows, buttons |
| 16 | Standard cards, settings cards |
| 18 | Hero, Today, calendar card, dialog |
| 999 | Pills, chips, switches |

### Depth

One diffuse shadow language:

- Card: `0 2px 10px rgba(0, 0, 0, 0.055)` light / `rgba(0, 0, 0, 0.35)` dark
- Floating/dialog: `0 12px 32px rgba(0, 0, 0, 0.18)`
- Border: 1px `border` on cards; tinted cards get a tinted border.
- Avoid heavy elevation, multiple shadow layers, or shadows on every row.

## 6. Components

### Screen header

- 28/800 page title + 12/500 subtitle on the left.
- 38×38 icon tile on the right: radius 12, `primarySoft`, 20–22 icon in
  `primary`.
- 20px side padding, 20px top, 4–8px bottom.

### Section header

- 6px semantic dot + 11/800 uppercase label on the left.
- 10px meta on the right ("126 tracked days", "Next 3", "Wellness estimate").
- 20px top margin, 8px bottom.
- Literal uppercase strings.

### Card

- `surface`, 1px `border`, 16–18 radius, 16–18 padding, soft shadow.
- Title 18/800; optional 10px meta on the same baseline.
- Optional body 13/19 muted.
- Use the shared `Card`/`SectionHeader`/`ScreenHeader` primitives; do not
  rebuild one-off card styles.

### Hero / Today gradient card

- 18 radius, 18 padding, 1px tinted border, soft shadow.
- Background: subtle `surface → primarySoft` gradient (SVG `LinearGradient` so
  no extra native dependency).
- Display numeral 44/800; phase pill 11/700 with 6px dot.
- Right-side next-period value 28/800 + 11 unit; date 11 muted.
- Phase track: 8px segmented bar, 2px gaps, current marker 2×16 with a surface
  ring.

### Pills and chips

- 999 radius; 9–11/700; soft background; 4–7px vertical padding.
- Primary: `primarySoft` + `primary`.
- Success/teal/amber: matching soft tint + status color.
- Neutral: `secondary` + `textSecondary`.
- Never use a pill for a destructive action.

### Stats

- Three columns in one card separated by 1px dividers.
- Value 26/800 + 10 unit; label 11 muted.
- Use `—` for honest missing data, never fake defaults.
- Optional qualitative pill ("Regular"/"Variable") with the value.

### Buttons

- Primary: `primary` fill, white 15/700, 12 radius, 48–52 high.
- Secondary: `surface`/`secondary` with a border, primary text.
- Destructive: error text on surface, or error fill for the final action.
- Minimum 44 touch target. Add a `testID` to every action.

### Icon tile

- 30–38 square, radius 10–12, soft tint, 15–22 icon.
- Used in headers, settings rows, pattern cards, dialogs.
- One tile per row; do not stack multiple colored tiles.

### Empty state

- A card or dashed-border soft panel, centered.
- Optional icon tile/emoji, 14/700 title, 12/17 muted body.
- Say what will unlock the content ("Track two periods…") rather than only
  "No data".

### Charts

- Symptom bars: 8–9px high, rounded ends, 4 phase colors, 1–2px gaps.
- Cycle length: every completed cycle in a horizontal row, six bars visible
  at a time (34px max) and older ones swipe in; `primaryWeak` with the newest
  bar `primary`; dashed recent-six average line; labels `MMM d` 9–10px.
- Mood: 2px line, daily dots, period days as 12% primary bands, 60-day window.
- Always include a caption or legend; color is never the only key.
- Sample size belongs next to the chart or in the card meta.
- When a length or date comes from the standard 28-day fallback rather than
  recorded cycles, label it as a standard estimate; never present it as
  learned.

### Tab bar

- 80 high, `surface`, 1px top border, 22 icons, 11/500 labels.
- Active `primary`; inactive `textSecondary`.
- Four tabs: Calendar, Overview, Insights, Settings.

### Dialog

- 18–20 radius, `surface`, centered, max width 400, 20 overlay.
- 48–56 icon tile with type color; 20/800 title; 14/20 message.
- Buttons 15/700; primary fill; cancel muted; destructive error.
- One `DialogComponent` per screen through `useDialog()`.

### Mood picker

- 16 radius card, 18 padding.
- 18/800 title; 10/800 section labels; 46 face circles; 999 chips.
- Selected chip: `primarySoft` with primary border; solid at strength 3.
- Auto-save; show the transient `✓ Saved` pill in `success`.

### Calendar card

The calendar is a signature surface. See
`design/app-language-design.html` for the visual.

- One 18px card contains: month nav, today pill, weekday row, day grid and
  legend.
- Month nav: 44×44 `secondary` chevrons, month title 18/800. Outside the
  current month, offer a labelled "Back to today" action.
- Today pill: compact 999 pill, `todaySoft` background, `today` text, 9/800.
- Weekday row: 9/800 uppercase, muted, 7 equal columns.
- Day cell: 41px row, 34×34 squircle (radius 11), 13/600.
- Period: `primary` fill, white 800 text.
- Predicted: `primaryWeak` fill, deep pink text.
- Fertile: `tealSoft` fill, teal text.
- No Period: a 4px muted dot at the bottom-right; the cell stays surface, so a long tracked history does not turn the month grey. The text stays muted.
- Today: a transparent 2px `today` inset ring, so a period fill remains
  visible; text uses `today` (or white on a period fill).
- Ovulation: 5px teal dot at the bottom (outlined for predicted).
- Legend: six compact chips inside the card, 9px, with dots; do not use a
  separate full-width legend row. The No Period chip is a muted dot, not a
  filled swatch.
- Keep the existing month-swipe animation, day tap and modal flow. The card is
  a surface change, not a calendar rewrite.
- Upcoming periods and fertility stay as separate section cards below.

## 7. Screen recipes

### First run

1. Full-screen, three-step, skippable Tidemark guide before the tabs on a
   fresh install. It is a root gate, not a tab and not a marketing splash.
   Skip is available on every step; Back is available on steps 2 and 3.
2. Step 1 — "Find your own rhythm." Large cropped concentric blush arcs with
   one pink marker, a compact "TIDEMARK · 01" eyebrow, the body "Make room for
   the patterns that are yours.", and the quiet line "Private by design. Yours
   to keep." Primary "Continue".
3. Step 2 — "A small note. A clearer picture." A clearly labelled
   `ILLUSTRATION` mini-calendar with one outlined date and a Period chip. It is
   decorative, hidden from assistive tech and never reads or writes data. Body
   "Start with the first day of your last period. Add only what you remember."
   plus the compact estimates disclaimer. Footer Back / Continue.
4. Step 3 — "Yours means yours." A device + exported-backup illustration, the
   local-only and backup-recovery statements, primary "Start with my last
   period", secondary "Import a backup", text "I’m unsure — explore Calendar",
   and "Reminders stay off until you choose." Back moves to the top bar because
   the footer holds the three actions.
5. No account field and no notification permission request. No seeded or
   fabricated data. Keep the marker on its arc: the pink dot is computed from
   the same SVG center/radius/angle as the r=338 arc in
   `components/onboarding/tidemarkGeometry.ts`; never eyeball coordinates.
6. Starting hands off to Calendar with a tint banner. Tapping a day opens the
   existing day `Sheet` with Period pre-set and a short hint; the footer reads
   "Save last period". Saving a mood alone does not complete setup. Import keeps
   the existing confirm, picker, validation and replacement flow.
7. Completion and pending state stay in `OnboardingService`: skip/explore
   complete as `skip`, a successful import completes as `import`, and the
   last-period route completes only after a period day is saved. If the app
   closes before that save, the Calendar banner resumes the setup.
8. Check light and dark at 320px and 390px. The body scrolls while the footer
   actions remain reachable; font scaling and reduced motion stay respected.

### Calendar

1. Screen header: "Period Calendar", subtitle "Tap a day to log or edit",
   calendar icon tile.
2. Before the first period exists, a start-period card sits above the calendar
   (start with last period, log today, import backup). While guided last-period
   setup is pending, a tint banner replaces it and the subtitle changes to
   "Tap the first day of your last period".
3. Calendar card (above).
4. Section "UPCOMING PERIODS" + pink dot + "Next 3" meta; list card.
5. Section "FERTILITY FORECAST" + teal dot + "Wellness estimate" meta; list
   card with the disclaimer note.
6. Tab bar with Calendar active.

### Overview

1. Screen header: "Overview", "Cycle, symptoms and mood over time", trend icon.
2. `CYCLE` section. With no recorded start, one warm start card replaces the
   hero, stats and chart: "Start with what you know", a primary "Add a period
   start", secondary "Import a backup", the period-start definition, and (only
   on a truly empty journal) a compact "What appears next" list. With one or
   more starts, keep the hero cycle day, estimated phase pill/track, labelled
   standard fallback, three-stat card and cycle-length chart. Missing metrics
   stay `—` at a quieter size with the exact missing count beneath ("Needs 1
   period start", "Needs 2 completed periods"). The one-start chart explains
   that the next start completes the first cycle and offers Open Calendar.
3. `SYMPTOMS` section: all tracked days in the denominator; phase legend and
   split only when at least one symptom day has a phase. Otherwise use a
   neutral percent bar, "Count only", and a phase-context note that says
   whether there is no period yet or the existing days are simply unphased.
   Empty is one compact panel: "Make a note of how you feel", the one-symptom
   requirement and Log today.
4. `MOOD` section: trend when five rated days exist in the last 60 days; phase
   rows when phases exist (tags-only phases say "Feelings by phase"); otherwise
   a chronological recent-entry list (up to five, all history) that shows
   ratings, feeling tags and legacy mood text without inventing a rating.
   Show exact trend progress (`3 of 5 rated days in the last 60 days … · 2
   more`) and one Log today action. Tags alone never advance the trend counter.
   Empty is one compact panel: "Your moods belong here too", the five-rating
   threshold and Log today.
5. Footnote: everything comes from Calendar entries.

### Insights

1. Screen header: "Insights", "What your log is telling you", lightbulb icon.
2. Today gradient card: phase/day pill and focus when a current phase exists.
   With no current phase, still render today's log-backed tips ("From today's
   log", headline, tip rows), a neutral phase-unavailable note and "Edit today
   in Calendar". A logged day without a tip acknowledges the actual rating,
   legacy mood or flow note. A truly empty day offers "Begin with a small
   note", Log today and Add a period start.
3. `YOUR PATTERNS` section: up to three cards when they qualify. Otherwise one
   calm context panel has a short state-specific lead and three labelled rows
   (Cycle / Symptoms / Mood) carrying the exact prerequisites. It
   distinguishes no log, no period context, a small sample, and enough sample
   without a clear pattern; the last is neutral rather than a request to keep
   inventing entries. Never promise a pattern after a count. One primary
   handoff: Add a period start with no starts, otherwise Open Calendar; an
   Import a backup link appears only on a truly empty journal.
4. `PHASE GUIDE` section: four phase chips. With no current phase, show one
   general-guide instruction plus the existing estimate disclaimer and let the
   user browse; do not imply a current menstrual phase. The note says timing
   stays general until a current phase can be estimated, so overdue history is
   still truthful.
5. Tab bar with Insights active.

### Settings

1. Screen header: "Settings", "Preferences, privacy and backups", gear tile.
2. Section label + card per group: App settings, Privacy, Support,
   Backup & restore.
3. Rows use 30px icon tiles, 13/700 title, 11 muted subtitle, switch or
   chevron on the right.
4. Cycle stats live in Overview; Settings does not repeat them.
5. Privacy note is a tinted success card with a shield icon, not an emoji.

### Notifications

1. Outside the tabs, reached from Settings → Notifications; back chevron,
   "Notifications", "Reminders, privacy and tone", bell tile.
2. First run is a setup flow: intro tint card, STYLE card (lock-screen detail
   and voice), PREVIEW notification card, CYCLE REMINDERS and ROUTINES cards,
   then a full-width "Enable notifications" button and the privacy note.
3. Once configured, the same screen leads with the master switch, shows a
   permission warning when the OS has blocked notifications, and keeps the
   style/preview/reminder cards plus a "Send test notification" row.
4. Switches use the primary track; sub-rows (lead time, cadence, time) appear
   only when their reminder is on. Use literal uppercase section labels.
5. Web shows a tinted "Available in the mobile app" notice and the style
   preview; never a dead switch.

### Day modal

- Use shared `Sheet`: 18 top radius, `background`, 86% height capped below
  the status bar, quiet slide (none with reduced motion), and a small handle.
- Header: date 18/800 + close button; 1px divider.
- MoodPicker card, Period card, Ovulation card, Symptoms card.
- Sticky footer with a primary Save button; the rest of the form uses the
  shared card/pill/row language.
- Footer accounts for the Android system navigation inset. Close is 44×44;
  errors stay beside Save, with selections preserved for retry. Use this same
  sheet for private entries and PIN changes.
- Keep the existing auto-save behavior for mood.
- Mood shows "Saved" only after storage succeeds. Selected feeling chips have
  a separate, reachable 44px clear action, rather than an overlapping badge.

### Private gate / private calendar

- Same typography, cards, pills and icon tiles, but neutral and discreet.
- No private data leaks into the main Calendar, Overview, Insights, seed data,
  analytics or notifications.
- PIN gate: centered card, shield icon tile, 28/800 title, 13/19 explanation,
  PIN inputs, primary action; error text in `error`.
- Keep the native screenshot protection and lock-on-background behavior.

## 8. Motion

- Quiet by default. Existing month swipe, modal slide and tab changes stay.
- Add one subtle screen fade on focus: opacity **0.94 → 1**, translateY
  **6 → 0**, **220ms**, standard easing. No bounce.
- Do not animate every card. No parallax, springy pops or looping motion.
- Respect reduced motion: skip the fade/translate when the OS asks for reduced
  motion.
- Press states: 0.97 scale or 0.7 opacity, no color flash.

## 9. Accessibility

- Minimum 44×44 touch target; 8px hitSlop for small icons.
- Body text at least 11px at 1x; 12–13 preferred.
- Contrast: use `text`/`textSecondary` on surfaces; avoid light text on
  `primarySoft`.
- Do not rely on color alone; pair with labels, numbers, dots or position.
- Every interactive element has a kebab-case `testID`.
- Empty/partial states explain what will unlock the content.
- Dialogs trap focus (existing CustomDialog behavior) and have a clear cancel.
- The private calendar must remain behind its PIN and AppState lock.

## 10. Implementation

- `design/tokens.ts` — spacing, radii, typography, shadows, tints.
- `hooks/useTheme.tsx` — extend `ThemeColors` with the tints above.
- `components/ui/` — `ScreenHeader`, `SectionHeader`, `Card`, `GradientCard`,
  `Pill`, `Stat`, `EmptyState`, `PrimaryButton`, `IconTile`, `ScreenFade`.
- Use `react-native-svg` for gradients; do not add a gradient dependency.
- Use the existing system font stack.
- The visual references remain `design/overview-insights-redesign.html`,
  `design/app-language-design.html`, `design/onboarding-alternatives.html`
  (Tidemark is the selected onboarding direction) and
  `design/privatecyc-6-alternatives.html` (Adaptive journal B is selected).

### New-feature checklist

- [ ] ScreenHeader with title, subtitle and tinted icon tile.
- [ ] Section headers use a dot + literal uppercase label + meta.
- [ ] Cards use the shared radius/border/shadow/padding tokens.
- [ ] Typography comes from the scale; 800 headings, 13/19 body, 11 captions.
- [ ] Phase colors match the semantic table and are always labelled.
- [ ] Missing data shows `—` or an EmptyState, never a fake default.
- [ ] Sample sizes shown where a percentage/pattern is claimed.
- [ ] `testID` on every new interactive element.
- [ ] Light and dark checked at 390px.
- [ ] Reduced-motion behavior checked.
- [ ] `npm run typecheck`, `npm test`, `npm run smoke:web` pass.

## 11. Do / Don't

**Do**

- Use blush tints and soft gradients sparingly for emphasis.
- Let numbers breathe; one hero number per screen.
- Keep cards white, calm and consistently spaced.
- Use phase colors as information, always with a label.
- Use friendly, specific copy with the user's own data.

**Don't**

- Mix the old 12px/0.1-shadow card language with the new 16–18px system.
- Add heavy elevation, neon gradients or multiple accent colors per card.
- Use `textTransform: uppercase`.
- Use color as the only signal for period, fertility or phase.
- Claim a pattern without its sample size.
- Put private calendar data into the main tabs, seed data or analytics.
- Add card-by-card entrance animations or bouncy motion.
