# Step 9 · Phase 3c — Coach editor: weekly schedule, picker labels, diff, drafts

Status: **READY** · written 29 Sep 2026 from Coach `main` at `e72379e`
(Coach 0.7.0). Branch: the session's own (see README).

## Why

Decided by John 29 Sep 2026: 3c starts with the **weekly schedule editor**,
because Ville's Block 2 (in force 16 Nov, authored by 8 Nov) may put sessions
on different days. Then the diff view and saved drafts.

## Repos

`Coach-PTapp` only. Do **not** edit `engine.js`, `program-schema.js`,
`cardio.js` (`a1ab926a…`, `e67329ea…`, `35e010b3…`). Same contract as 3a/3b:
pure functions in `src/core/editor.js` that return a new definition and never
mutate; UI in `src/editor.jsx`; Check → existing `preflight`; Publish →
existing `insertProgramVersion`.

## Facts this brief rests on (verified 29 Sep 2026, all 5 live definitions)

- `schedule` has two weeks, `A` and `B`. Which one applies is decided by the
  engine (`resolveSchedule`): **ISO week number even → A, odd → B**. Every
  live programme has both.
- Each week is keyed by `getDay()` strings **`"0"` (Sunday) … `"6"`
  (Saturday)**. Each day is `{ <slot>: <blockKey> | null, …, note? }`, e.g.
  Ville A `"1": { strength: "a", run: null, bike: null, yoga: null }`,
  `"0": { …all null, note: "PK1 walk or Nordic walk — or rest" }`.
- The validator (`program-schema.js` ~line 196) errors if a day points at a
  block that does not exist, and warns on a key that is not a slot.
- Retired blocks can still be referenced by old versions; a **new** schedule
  should only offer live blocks (key is a `value` in `slotOptions[slot]`).
- **Picker labels are deliberately short and differ from block labels in all
  35 live options** (e.g. option `"A"` ↔ block `"Session A — Chest /
  Vertical Pull"`). 3b correctly does not sync them; 3c adds a way to edit
  the short label.
- A client's own day overrides (moved / cleared sessions) still apply on top
  of the schedule; the editor changes only the default week.

## Scope

### 1. Schedule — `src/core/editor.js`

- `setScheduleCell(def, week, dow, slot, blockKey | null)` — `week` ∈ `A|B`,
  `dow` ∈ `"0"…"6"`, `slot` ∈ `def.slots`; `blockKey` must be a **live**
  block of that slot or `null` (throw otherwise). Always writes the slot key
  explicitly (null, not absent), matching the live shape.
- `setDayNote(def, week, dow, text)` — empty removes `note`.
- `copyWeek(def, from, to)` — deep copy of one week onto the other.
- `weekFor(dateStr)` → `"A"` | `"B"` using the same ISO-week rule as the
  engine (import from `engine.js`/`dates.js`, do not reimplement).

### 2. Picker labels

- `setOptionLabel(def, slot, key, label)` — changes the `slotOptions` label
  of a live block; required non-empty.
- `addBlock(def, slot, label, shortLabel?)` — `shortLabel` defaults to
  `label`. `restoreBlock(def, slot, key, shortLabel?)` likewise (3b used the
  block label because the old option label is not stored; keep that default,
  but let the UI pass a short label).

### 3. Diff — `diffDefinitions(base, draft)`

A plain list the coach reads before publishing, e.g.:
- `Schedule A · Tue: run easy → long`; `note changed`;
- `Block added: run/tempo "Tempo run"`; `retired` / `restored`;
- `Exercise added to strength/a: Bulgarian split squat (bss)`; `removed`;
  `moved`; `field changed: presc "4×6–10/leg" → "4×8/leg"`;
- `Cardio target run/long: duration 90 → 120 min`; `Zones changed`;
  `Cardio types changed`; `Picker label strength/a: "A" → "A — Legs"`.
Order: schedule, blocks, exercises, cardio, labels. Nothing listed for keys
that did not change.

### 4. Drafts kept across reloads

- Save the draft to `localStorage` under
  `coachDraft_<personId>` with `{ baseId, savedAt, draft }` after each edit
  (Coach has its own origin, `coach.yellowg.fi`; no client data mixes).
- On opening the editor: if a saved draft's `baseId` equals the version now
  in force, offer **Resume draft** / **Discard**; if it differs (someone
  published meanwhile), say so and offer **Discard** only.
- Clear the saved draft after a successful Publish.
- Wrap every `localStorage` call in try/catch; the editor must work without
  it.

### 5. UI — `src/editor.jsx`

- **Weekly schedule** section at the top of the editor: tabs **Week A /
  Week B**, a line "Week of <effective date> is Week X" (from `weekFor`),
  **Copy A → B** / **Copy B → A**. A 7-column grid, **Monday first**
  (keys `1,2,3,4,5,6,0`), one dropdown per slot per day (live blocks + "—"),
  and a note field per day. A cell holding a retired block shows its label
  greyed with the dropdown still usable.
- Picker label field per live block ("Short label in the client's picker").
- **Changes** panel above Check showing `diffDefinitions(base, draft)`;
  "No changes" disables Check.
- Draft resume/discard prompt as above.

## Tests — extend `verify-editor.mjs`

- every new function leaves its input unchanged;
- `setScheduleCell` rejects a retired block, an unknown slot, a bad `dow`;
  writes `null` explicitly;
- `copyWeek` makes B deep-equal A and later edits to A do not change B;
- `weekFor` agrees with the engine's `resolveSchedule(...).weekType` for 60
  consecutive days (use the engine itself as the oracle);
- `setOptionLabel` changes only that option;
- `diffDefinitions(x, x)` is empty for every fixture; a draft with one change
  of each kind lists exactly those changes;
- a Ville draft that moves `run/long` from Saturday to Sunday in both weeks
  **passes `preflight`**, and the diff lists exactly two schedule lines;
- draft storage: save → load round-trips; a stale `baseId` is detected;
  a throwing `localStorage` stub does not break the editor model.

Extend `verify-render.mjs` (same bundling): the schedule grid renders for
every fixture client, Monday first.

## Out of scope

Testing schedule, daily sections, mobility, slotMeta, new slots, `startDate`,
deload wave settings, any client repo, any Supabase write.

## Gates

Same as 3b (all Coach verify scripts, bundled render check, `npm run build`),
hashes of `engine.js` / `program-schema.js` / `cardio.js` unchanged, no
`package-lock.json` churn. `COACH_VERSION` → `0.8.0`.

## Done means

One Coach PR with code, rebuilt `bundle.js`/`styles.css`, and
`briefs/reports/step9-phase3c-editor-schedule-report.md`.
