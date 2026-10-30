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

Use these consistently in the calendar, charts, legends and Insights:

| Phase | Color |
| --- | --- |
| Menstrual | `primary` pink |
| Follicular | `success` green |
| Ovulation | `teal` |
| Luteal | `warning` amber |

Never communicate phase or state with color alone. Pair it with a label,
number, dot position or icon. Phase colors are data, not decoration.

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
- Cycle length: 6 bars max, 34px wide, `primaryWeak` with the newest bar
  `primary`; dashed average line; labels `MMM d` 9–10px.
- Mood: 2px line, daily dots, period days as 12% primary bands, 60-day window.
- Always include a caption or legend; color is never the only key.
- Sample size belongs next to the chart or in the card meta.

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
- Month nav: 30×30 `secondary` chevrons, month title 18/800.
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

### Calendar

1. Screen header: "Period Calendar", subtitle "Tap a day to log or edit",
   calendar icon tile.
2. Calendar card (above).
3. Section "UPCOMING PERIODS" + pink dot + "Next 3" meta; list card.
4. Section "FERTILITY FORECAST" + teal dot + "Wellness estimate" meta; list
   card with the disclaimer note.
5. Tab bar with Calendar active.

### Overview

1. Screen header: "Overview", "Cycle, symptoms and mood over time", trend icon.
2. `CYCLE` section: hero gradient, three-stat card, cycle-length card.
3. `SYMPTOMS` section: 68 tracked days meta; symptom card with phase bars.
4. `MOOD` section: "By phase" meta; 60-day trend when enough valence, always
   the phase rows and a partial-data note.
5. Footnote: everything comes from Calendar entries.

### Insights

1. Screen header: "Insights", "What your log is telling you", lightbulb icon.
2. Today gradient card: phase/day pill, tagline, summary, one focus row and a
   compact today's-tips block backed by today's symptoms/mood.
3. `YOUR PATTERNS` section: up to three cards (symptom, mood, cycle) with mini
   visual, sample chip, stat and "TRY THIS"/"WHY IT MATTERS".
4. `PHASE GUIDE` section: four phase chips, phase title/hormones, summary only
   when browsing another phase, four tips, disclaimer.
5. Tab bar with Insights active.

### Settings

1. Screen header: "Settings", "Preferences, privacy and backups", gear tile.
2. Section label + card per group: App settings, Cycle settings, Privacy,
   Support, Backup & restore.
3. Rows use 30px icon tiles, 13/700 title, 11 muted subtitle, switch or
   chevron on the right.
4. Cycle info card uses three list rows with primary values.
5. Privacy note is a tinted success card with a shield icon, not an emoji.

### Day modal

- Bottom sheet, 20 top radius, `background`, 80% height, slide animation.
- Header: date 18/800 + close button; 1px divider.
- MoodPicker card, Period card, Ovulation card, Symptoms card.
- Sticky footer with a primary Save button; the rest of the form uses the
  shared card/pill/row language.
- Keep the existing auto-save behavior for mood.

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
- The visual references remain `design/overview-insights-redesign.html` and
  `design/app-language-design.html`.

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
