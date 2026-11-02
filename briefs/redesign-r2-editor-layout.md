# Coach redesign · R2 — Programme editor layout with drag-and-drop week

Status: **READY.** Written 29 Sep 2026; §0 added after R1 merged, from
Coach `main` at `5a92830` (0.9.0). Branch: the
session's own (see README). If `main` does not contain R1 (the tabbed shell,
`COACH_VERSION` 0.9.0), stop and report.

## Why

John, 29 Sep 2026: keep the depth of design **A2** (full programme editor)
and add **B2's drag-and-drop weekly schedule**. Design canvas (private,
reference only): board **A3 · Merged editor**. Everything needed is below.

## Repos

`Coach-PTapp` only. Do **not** edit `engine.js`, `program-schema.js`,
`cardio.js`, `dates.js`. Same contract as 3a–3c: model changes are pure
functions in `src/core/editor.js` that return a new definition; UI in
`src/editor.jsx`; Check → `preflight`; Publish → `insertProgramVersion`.
Draft saving, resume/discard, the two-step Check → Publish rule, retire
confirmation and required-field rules stay exactly as they are.

## Facts this brief rests on

- `ProgrammeEditor` (`src/editor.jsx`) holds all state (`session`, `when`,
  `result`, `pending`, `blanks`, draft storage). `ScheduleEditor` renders a
  7 × slots grid of `<select>`s calling `setScheduleCell(def, week, dow,
  slot, key|null)`, plus `setDayNote`, `copyWeek`, `weekFor`.
- A day holds **at most one block per slot** (`{strength, run, bike, yoga,
  note}` for Ville). Days are `"0"` (Sun) … `"6"`; display order `DOW_ORDER`
  Mon → Sun.
- Slot colour and label: `slotMetaFor(program, slot)` → `{label, color}`.
  Short picker label: `slotOptions[slot]` entry `{value, label}`.
- Live block = key appears as a `value` in `slotOptions[slot]`. Only live
  blocks may be placed in a new schedule (`setScheduleCell` throws otherwise).

## Scope

### 0. Two Overview fixes from R1 review — `src/core/overview.js`

Decided by John 29 Sep 2026 after checking R1 against live data.

**a) `str` (Strength sessions) counts days, from the app log or the watch,
only while a programme is in force.** Today `strMetric` counts watch
`strengthTraining` workouts over 7 calendar days, while "planned" counts only
days with a programme — so Ville showed "4 of 2 planned" (two of the four
were before his programme started on 28 Sep), and anyone who logs strength
only in the app is never counted.
- Window: the last 7 days incl. today, **minus days with no version in force**
  (`versionFor(ctx, date)` null).
- Done: a day counts once if **either** the app log scored strength done for
  that day (`ctx.adherence.days[].byCat.strength.done > 0`) **or** a real,
  deduped `strengthTraining` workout exists that day. Two sources on one day
  = one day.
- Planned: days in the same window whose resolved schedule has a strength
  block (unchanged).
- Value `done`, note `of N planned`; when the window was shortened, note
  `of N planned · since <d.m.>`. No programme in the whole window → `null`,
  "No programme in force". No longer requires a wearable connection (the app
  log alone is enough).
- Expected on today's live data (29 Sep): Ville `2`, "of 2 planned · since
  28.9."; Juha `0`, "of 1 planned" (his only strength day is today, not yet
  done).

**b) "Unplanned session" = a workout that matches nothing planned that day.**
Today any real workout on a day with no planned non-strength slot is flagged,
so a strength workout on a strength day is flagged. New rule, per real,
deduped workout of a day up to today:
- `strengthTraining` matches if that day's resolved schedule has a strength
  block.
- Any other sport matches if a `cardioTypes` entry lists the sport and its
  `slot` is planned that day; if **no** `cardioTypes` entry lists the sport
  (true for every live programme today — none has `cardioTypes`), it matches
  when any non-strength slot is planned **or** the client added an activity
  to that day (`overrides[day].activities` non-empty). Unknown mapping must
  not raise a false alarm.
- Flag only workouts that match nothing. Skip days: a workout on a skip day
  is flagged (the client cleared the day, then trained).

Tests (add to `verify-overview.mjs`): strength workout on a strength day →
no flag; strength workout on a run-only day → flag; run on a run day with
and without `cardioTypes`; walk on a rest day with a client activity → no
flag; walk on a rest day without → flag; `str` with watch + app log on the
same day counts 1; `str` window shortened by a programme start shows
"since"; app-log-only person (no wearable) gets a number, not "—".

### 1. Model — `src/core/editor.js`

- `moveScheduleCell(def, week, fromDow, toDow, slot)`: moves the block in
  `fromDow`'s `slot` to `toDow`. If `toDow` already holds a block in that
  slot, the two **swap** (moving a long run Sat → Sun where Sun has an easy
  run puts the easy run on Sat). Same day → unchanged definition. Empty
  source → throw. Built on `setScheduleCell`, so all its checks apply.
  Retired blocks already in the schedule may be moved (they are there
  already); only placing a retired block from the library is refused.
- `diffDefinitions` must describe a swap as the two cell changes it is
  (no new wording needed).

### 2. Layout — `src/editor.jsx`, inside R1's Programme tab, full width

Three columns at ≥ 1280 px (library 260 px · board flexible · publish
panel 320 px); below 1280 the publish panel moves under the board.

- **Header row**: base version name + "draft" status (`saved hh:mm` / "no
  changes"), Week A / Week B tabs (label the tab containing the effective
  date, e.g. "Week B · 16 Nov"), Copy A → B / Copy B → A.
- **Left · Session library**: one group per slot (slot colour bar +
  label), each live block as a card (short label + block label + one
  meta line: exercise count for strength, `durationMin`/zone for cardio),
  "+" to add a block (existing `AddLabelled`). Retired blocks under a
  collapsed "Retired (n)" per slot, with Restore. Clicking a card selects it.
- **Centre top · Week board**: 7 day columns (Mon → Sun, with the date of
  that weekday in the week of the effective date). Each column lists its
  placed blocks as cards in slot order, coloured by slot; the day note in
  italics at the bottom (click to edit, `setDayNote`).
  - Drag a **library card** onto a day → `setScheduleCell` (replaces the
    same slot there, if any).
  - Drag a **day card** to another day → `moveScheduleCell` (swap rule).
  - Each day card has a × button → `setScheduleCell(…, null)`.
  - Drop targets highlight while dragging; a drop the model refuses shows
    the existing `notice` line, never a silent no-op.
  - Native HTML5 drag and drop; **no new dependency**.
  - **Keyboard / no-drag alternative**: a "Table" toggle in the board header
    shows today's `ScheduleEditor` select grid unchanged. Both views edit
    the same draft.
- **Centre bottom · Selected block**: the existing block editor for the one
  selected block (label/subtitle/gentler note/picker label; strength →
  exercise table with move/remove/add existing/add new; cardio → cardio
  target fields), plus Retire. Nothing selected → the first block of the
  first slot.
- **Right · Publish panel**: effective date field (and which week it falls
  in), "Changes · n" list from `diffDefinitions`, Check, Publish (appears
  only after a passing check, as today), result messages; below, collapsible
  **Heart-rate zones**, **Cardio types**, **Day notes** sections holding the
  existing controls.

Visual: `THEME` tokens only, cards `T.card`, 1 px `T.border`, slot colour as
a 3 px left edge. The R1 shell remains the surrounding page.

### 3. Version

`COACH_VERSION` → `0.10.0`.

## Out of scope

New model features beyond `moveScheduleCell` · per-day multiple blocks in
one slot · touch drag · client repos · Supabase.

## Gates

All existing gates `0 failed` (incl. R1's `verify-overview`) plus:

- **verify-overview**: the §0 tests, plus all existing ones still passing.
- **verify-editor**: `moveScheduleCell` — move to an empty day; swap with an
  occupied day; same day is a no-op; empty source throws; moving a retired
  block already placed works; the diff of a swap lists both cells; Ville
  Block 2 scenario (long run Sat → Sun, both weeks) done with
  `moveScheduleCell` gives the same definition and diff as the existing
  `setScheduleCell` test of that scenario, and passes `preflight`.
- **verify-render**: the editor renders for Juha, Henna, Joonatan (board
  and table views) without throwing and with 7 day columns.
- `npm run build` succeeds.

## Report

As README.
