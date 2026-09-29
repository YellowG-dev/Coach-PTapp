# Coach redesign · R2 — Programme editor layout with drag-and-drop week

Status: **READY — start only after R1 is merged.** Written 29 Sep 2026 from
Coach `main` at `a4b67cd` (0.8.0); R1 takes it to 0.9.0. Branch: the
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
