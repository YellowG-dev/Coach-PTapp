# Coach · Overview polish and Training log redesign

Three parts, one session: §1 tab bar, §2 "Recovery vs baseline",
§4 Training log (week grid + day card). Updated 5 Oct evening to add §4.

Status: **READY.** Written 5 Oct 2026 from live `main` (Coach 0.12.1,
`b8c88b1`). Coach only; no client repo, no shared file, no Supabase.
Branch: the session's own (see README).
Version: Coach → **`0.12.2`**, with the `index.html` `?v=` cache-bust.

## Why

John, 5 Oct, from the live Overview:
1. The tab bar shows small scroll arrows at the right and the active tab's
   colour is clipped.
2. The cyan "Recovery · 7 nights" bars don't tell anything. Replace them
   with a view that shows trends and results.

## Decision (John, 5 Oct 2026)

Build "Recovery vs baseline" **as mocked in chat**: a 30-night line per
metric, a normal-range band, the last 7 nights drawn solid, out-of-range
nights marked, and a one-line verdict.

## Facts (verified 5 Oct 2026)

### Tab bar

- `src/app.jsx` `TabRow` (~line 458): the row is
  `flex gap-1 border-b mb-4 overflow-x-auto`; each tab button has
  `border-b-2 -mb-px`.
- The `-mb-px` pushes each button 1 px below the row. With
  `overflow-x: auto`, CSS makes `overflow-y` auto too, so the 1 px overflow
  produces a vertical scrollbar (the arrows on Windows) and clips the
  underline.
- `overflow-x-auto` is there for phone width, where the five tabs may not fit.

### Recovery card

- `src/overview.jsx` `Bars` (~line 240), title "Recovery · 7 nights", uses
  `recoveryBars(ctx.recovery)` from `src/core/overview.js` (~line 410–441,
  `BAR_ROWS`: `sleepH`, `readiness`, `hrv`, `rhr`).
- Each bar's height is `v / max` of the same 7 nights, so small real
  differences look equal. Juha's 7 nights to 5 Oct: HRV 36–48 → bars
  75–100 %; resting HR 50–52 → 96–100 %. No baseline, no dates, no
  direction (higher resting HR is worse).
- `ctx.recovery.series` (`src/core/recovery.js` `buildRecovery`) already
  holds up to 30 days, oldest first, one row per day:
  `{ day, label, sleepH, readiness, hrv, rhr }`, `null` where missing.
- Theme tokens in `src/config.jsx`: `T.good` (`#7FB88F`), `T.warn`
  (`#C97388`), `T.border`, `T.textMuted`, `T.textSecondary`,
  `T.textPrimary`. Use these; no new hex in components.

### Tests that reference the old card (expectations allowed to change)

- `verify-overview.mjs` ~lines 254–257: three `recoveryBars` checks.
- `verify-render.mjs` ~line 158: the needle `"Recovery · 7 nights"`.
- `verify-overview.mjs` ~line 10 and 83 import and call `recoveryBars`.

These are the **only** existing expectations this brief allows to change,
and only as §2 says. §4 changes no existing expectation: `DayCard` keeps
its name and props, and every current `verify-render` check must still pass. Any other check that changes result → stop.

## Scope

### 1. Tab bar (`src/app.jsx` `TabRow`)

- Change the row to `overflow-x-auto lg:overflow-visible` and add
  `overflow-y-hidden` below `lg`, so desktop has no scroll container at all
  and phone width keeps horizontal scrolling.
- The active tab's full 2 px accent underline must be visible at every
  width. If `overflow-y-hidden` clips it on phone width, replace the
  `-mb-px` overlap with a layout that doesn't overflow (for example, no
  `border-b` on the row and a 1 px divider drawn under it). Report what you
  chose.
- No change to tab labels, order, colours or font size.

### 2. "Recovery vs baseline" (`src/core/overview.js` + `src/overview.jsx`)

**Pure function** `recoveryBaseline(recovery)` in `src/core/overview.js`,
replacing `recoveryBars` (remove `recoveryBars` and its import/use).
Returns `null` when there is no series, else:

```
{
  rows: [{
    id, label, unit, betterWhen: "higher" | "lower",
    nights: [{ day, value }],          // last 30 calendar nights ending at the newest night; value null when missing
    latest,                            // newest non-null value, or null
    n,                                 // non-null nights in the 30
    baseline: { mean, sd, lo, hi } | null,   // null when n < 14
    week: { mean, delta, status } | null,    // last 7 calendar nights; null when none or no baseline
    outside: [{ day, value, better }]        // nights outside lo–hi
  }],
  verdict: string,
}
```

Rules:
- Metrics, in this order: Sleep (`sleepH`, h, higher better), Readiness
  (higher), HRV (`hrv`, ms, higher), Resting HR (`rhr`, bpm, **lower**
  better).
- `baseline` = mean and population SD of the non-null values in the 30
  nights; `lo = mean − sd`, `hi = mean + sd`. Fewer than 14 non-null nights →
  `baseline: null` (no band, no colouring, no verdict for that metric).
- `week.mean` = mean of the non-null values in the last 7 calendar nights;
  `delta = week.mean − baseline.mean`; `status` = `"normal"` when
  `|delta| < 0.5 × sd`, otherwise `"better"` or `"worse"` by `betterWhen`.
- `outside`: every night with a value `< lo` or `> hi`; `better` by
  `betterWhen`.
- `verdict`:
  - any `worse` → `"Below normal this week: <labels, comma-separated>"`;
  - else every metric with a baseline is `normal`/`better` →
    `"All within normal range this week"`;
  - no metric has a baseline → `"Building baseline — <n> of 14 nights"`
    (n = the largest `n`).
- Never estimate a missing night; a missing night is a gap in the line.

**Card** (`src/overview.jsx`), title **"Recovery vs baseline"**, same
position and size as today:
- Verdict line under the title (`T.textSecondary`; `T.warn` when it names a
  metric).
- One row per metric: label · inline SVG line · right column.
  - SVG: shaded band `lo`–`hi` (subtle, from existing tokens), dashed
    baseline mean, the first 23 nights as a thin muted line, the last 7 as a
    solid `T.textPrimary` line, gaps at missing nights, a dot on each
    `outside` night in `T.good` (better) or `T.warn` (worse). Day labels
    for the first and last night under the last row only.
  - Right column: latest value with unit; "7-night ±x vs normal" coloured
    by `status` (`normal` → `T.textSecondary`, `better` → `T.good`,
    `worse` → `T.warn`); "normal lo–hi" in `T.textMuted`.
  - `baseline: null` → line only, and "Building baseline (n/14)" in the
    right column.
- `aria-label` on each SVG naming the metric and its status; the colour is
  never the only signal (the text says better/worse).
- Formatting: sleep 1 decimal, the others integers.
- No data at all → "No wearable data." as today.

### 3. Version and build

`COACH_VERSION` → `0.12.2`, `?v=` → `0.12.2`, `npm run build`.

### 4. Training log: week grid on top, selected day's card below

**Decision (John, 5 Oct 2026):** the Training log tab becomes a week grid
(design B) with, beneath it, the day card (design A) for the day selected in
the grid. Reference mockup, built from Juha's real 28 Sep – 4 Oct data:
`briefs/design/training-log-combined.dc.html` (open it in a browser; it is
static HTML with inline styles). Match its layout, hierarchy and colours
using `T` tokens. Values in `[square brackets]` in the mockup are
placeholders the code computes.

**Facts (verified 5 Oct):**
- `src/app.jsx` `PersonPanel`, `tab === "log"` (~line 505): renders
  `Adherence` then a paged list of `DayCard`s (`PAGE = 20`) with "Show
  earlier days".
- `DayCard({ day, scored, names })` (~line 913) uses `shapeDay` /
  `shapeOverride` from `src/core/shape.js`. `shapeDay` returns `exercises`,
  `checks`, `ticked`, `measurements`, `notes` and more.
- `scored` (from `pctByDay`) carries `pct`, `doneCount`, `total`, `skip`.
- `verify-render.mjs` renders `Adherence` and `DayCard` with
  `{ day, scored, names }` and checks: the % badge text is present, and no raw
  ID (`up-`, `lo-`, `mob-`) leaks into the markup. `verify-adherence.mjs`
  checks the exports `PersonPanel`, `DayCard`, `Adherence` exist.
- Today the card prints internal keys, e.g. "dismissedWorkouts set to
  oura:…" and "cardio cleared".

**Build:**

a. **Pure function** `logWeek(...)` in a new `src/core/logweek.js`, from
   the data `PersonPanel` already has (log rows, override rows, programme
   versions, names; wearable workouts if available in `ctx`). One week
   (Mon–Sun) → per day:
   - `session`: label of the scheduled/done block(s), from the version in
     force on that day (`resolveVersion` + `resolveSchedule`), or "Cleared"
     on a skip day, or "No session";
   - `exercisesLogged` / `exercisesPlanned` for strength blocks (logged = has
     sets; ticked-without-sets and not-done listed separately);
   - `sets`, `volumeKg` (Σ reps × kg over logged sets);
   - `mobility` ticked / list length (`mobilityFor`);
   - `kcal`, `protein`, `carbs`, `fat` with that day's target from
     `nutritionTargets` by day type (`isTrainingDay` of the version in
     force), and the difference;
   - `weigh`, `knee`/scales, `alcohol` units, `note` (present or not);
   - `adherence` = the existing `pctByDay` entry.
   Plus week totals: sessions, sets, volume, confirmed cardio minutes
   (`weeklyCardioMinutes`), average kcal, protein days on target, weigh-in
   first → last and its change.
   Never estimate a missing value: missing → `null` → shown as "—".

b. **Colour rules** (approved: "as in the mockup"), in ONE exported object
   in `logweek.js` so they can be tuned later:
   - calories: within ±10 % of that day's target → on target; else off;
   - protein: ≥ target → on; more than 10 % below → off; else neutral;
   - mobility: ≥ 60 % of the list → on; ≤ 30 % → off; else neutral;
   - exercises logged: ≥ 80 % of planned → on; < 70 % → off; else neutral;
   - alcohol: > 0 → off;
   - weigh-in, knee, sets/volume: never coloured.
   On = `T.good` text on the existing `T.doneBg`; off = `T.warn` text on a
   tint from tokens (add one `T` token if needed, report it); neutral =
   `T.panel`. The legend in the mockup explains the three.

c. **`LogWeek` component** (top): week navigation (‹ › and the week's
   dates; default the current week), the five summary tiles, the grid
   (rows: Session, Exercises logged, Sets · volume, Mobility, Calories vs
   target, Protein, Weigh-in, Knee · alcohol, Note). Each day column is a
   real `<button>` (keyboard reachable) that selects the day; the selected
   column has the accent outline and header underline. Default selection:
   today if it has data, else the latest day in the week with data. At
   narrow width the grid scrolls sideways in its own box.

d. **`DayCard`** (below, for the selected day) is redesigned to design A:
   date block, session title with category colour, "x of y exercises
   logged · …", adherence bar + `pct · done/total`, the six-tile results
   strip, the exercise table (sets as pills, top set, "vs last time"), then
   "Ticked, no sets" and "Not done", then the note as a quote.
   - **Keep the export name `DayCard` and its props** `{ day, scored, names }`
     (new props optional), so `verify-render` keeps working unchanged.
   - "vs last time": the most recent EARLIER logged day with sets for the
     same exercise id; compare top set (heaviest kg, then most reps): show
     "▲ +x kg", "▲ +x reps", "=", or "▼ …"; none earlier → "first log".
   - Plain words only: a cleared slot reads "Zone 2 cleared" (block label),
     dismissed watch workouts are not shown, substitutions read
     "Cable curl — for Ez-bar curl".
   - Skip day: "Cleared — <reason>" title and no exercise table.

e. **Remove** the long paged list of day cards from this tab; earlier days
   are reached with the week arrows. Keep `Adherence` (30-day / all-time
   summary) above the grid, compacted to one line if it fits.

**Tests:**
- New `verify-logweek.mjs`: Juha fixture week(s) — per-day values match a
  hand computation in the test (sets, volume, kcal difference vs the right
  day-type target, mobility count); missing values are `null`; each colour
  rule's boundaries (exactly 10 %, exactly 60 %/30 %, 80 %/70 %); "vs last
  time" for up, same, down and first log; a skip day; a day logged against
  an older programme version uses that version's target and exercises.
- `verify-render.mjs`: unchanged checks must still pass; add a render of
  `LogWeek` for one Juha fixture week (no raw IDs, every day column present).
- Browser check (same folder as §2): Training log at 1440×900 — grid and
  card render; clicking another day column changes the card; ‹ › change the
  week; 390×844 — grid scrolls in its box, card stacks; screenshots.

## Out of scope

- Client repos, shared files, Supabase.
- On Overview: the four metric boxes, the "This week" grid, Needs attention,
  Recent sessions.
- The Training log's data rules (adherence scoring, `shapeDay`): §4 reads
  them, never changes them.
- Progress tab charts.
- Any change to `buildRecovery`.

## Tests and gates

### `verify-overview.mjs`

Replace the three `recoveryBars` checks with at least:
- no series → `null`;
- missing nights are `null` in `nights`, never 0, and the line has a gap;
- Juha fixture: `latest` correct for each metric; `baseline.mean`/`sd`
  match a hand computation in the test; `week.status` correct;
- resting HR: a week **above** baseline by ≥ 0.5 SD is `worse`; HRV the same
  is `better`;
- fewer than 14 nights → `baseline: null`, no colouring, and the
  "Building baseline" verdict;
- `outside` lists exactly the nights beyond `lo`/`hi`, with `better` by
  direction;
- verdict wording for each of the three cases.

### `verify-render.mjs`

Change only the needle `"Recovery · 7 nights"` → `"Recovery vs baseline"`.
Run it bundled, as its header describes.

### Browser check (headless Chromium, `briefs/reports/coach-overview-recovery/`)

- At 1440×900 and 1280×800: the tab row has
  `scrollHeight <= clientHeight` and `scrollWidth <= clientWidth` (no
  scrollbar), and the active tab's underline is 2 px tall in the
  screenshot.
- At 390×844: the tab row still scrolls horizontally if the tabs overflow,
  with no vertical scrollbar.
- The Recovery card renders for Juha with bands, solid last 7 nights and
  out-of-range dots; screenshots of the card in both a "normal" and a
  "worse" fixture week.
- No page errors.

### Gates

Every Coach gate ends `0 failed` / all passed, including `verify-render`
(bundled), plus `npm run build`.

## Stop rules (beyond the README)

- Any check other than those named in "Tests that reference the old card"
  changes result → stop and report.
- A needed colour isn't available as a token → stop and ask; don't add hex.
- The tab fix would change the tab layout at phone width beyond removing the
  vertical scrollbar → stop and report.

## Done means

- One PR (Coach), not merged.
- Report at `briefs/reports/coach-overview-recovery-report.md`: result,
  changes, gates, screenshots, open items.

Chat verifies, then John merges.
