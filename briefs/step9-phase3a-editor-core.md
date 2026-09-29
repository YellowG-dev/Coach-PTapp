# Step 9 · Phase 3a — Coach programme editor, core

Status: **READY** · written 29 Sep 2026 from Coach `main` at `e8d0bd2`
(Coach 0.5.3). Branch: the session's own (see README).

## Why

Ville's Block 2 starts 16 Nov; target is to author it **in-app by 8 Nov**.
Today a new programme version means hand-writing JSON and pasting it into the
Publisher. Phase 3 replaces the hand-writing, not the pipeline: the editor
produces a definition and hands it to the **existing** `preflight()` →
`insertProgramVersion()` path. One contract, no second validator.

Phase 3 is split into small sessions so each one ships something usable:

| session | delivers |
|---|---|
| **3a (this brief)** | pure edit model + tests; edit **existing** blocks and exercises in a UI; check and publish through the existing path |
| 3b (next brief) | add / remove / reorder exercises with new-ID minting; add blocks, retire blocks; block cardio targets; zone table and cardio types |
| 3c (next brief) | diff against the version in force; draft kept across reloads; polish |

Decided with John 28 Sep: **v1 edits blocks and exercises. Schedule, testing
and daily sections stay as they are** (carried over unchanged).

## Repos

`Coach-PTapp` only. No client repo is touched. `engine.js` and
`program-schema.js` must stay byte-identical to the clients — **do not edit
them**.

## Facts this brief rests on (verified 29 Sep 2026)

- `src/app.jsx` `Publisher` (line ~364) takes pasted text → `preflight({
  person, text, effectiveFrom, existingRows, logRows, ownerId })` → on `ok`,
  `insertProgramVersion(result.row)` (`src/core/data.js`), then
  `onPublished()` reloads. `preflight` already runs the client's `validate()`
  and the ID-permanence check. **Reuse this path exactly**; pass
  `JSON.stringify(definition)` as `text`.
- The version in force on a date is resolved by `resolveForDate(rows, date)`
  in `src/core/program-schema.js`. It takes **one client's** rows — filter by
  `assigned_to === personId` first; it does not filter itself.
- A block is *retired* when its key is not a `value` in
  `slotOptions[slot]` (e.g. Ville `run`: `[{value:null},{value:"easy"},
  {value:"long"}]`). Retired blocks stay in `blocks` so history resolves.
- Keys actually used in live definitions (all 5 rows, `fixtures/programs.json`):
  - block: `label, subtitle, cat, noGym, gentlerNote, exercises`
  - exercise: `id, name, presc, sets, detail, video, pattern, altName,
    altVideo, type, unit, pctMin, pctMax`
- Coach gates (all pass on `main`): `verify.mjs`, `verify-adherence.mjs`,
  `verify-publish.mjs`, `verify-recovery.mjs`, `verify-validator.mjs`, and
  `verify-render.mjs` — which needs bundling first, exactly as its header
  says.

## Scope

### 1. Pure edit model — new `src/core/editor.js`

No React, no Supabase. Every function takes a definition and returns a **new**
definition (never mutates its input). Tested in plain `node`.

- `startDraft(rows, personId, date)` → deep copy of the definition in force
  for that client on `date` (rows filtered by `assigned_to`, then
  `resolveForDate`), plus `{ baseId }` so the
  UI can say what it was based on. No version in force → `null` and a reason.
- `setBlockField(def, slot, blockKey, field, value)` — `field` ∈ `label,
  subtitle, gentlerNote, noGym`. Empty string removes optional fields
  (`subtitle`, `gentlerNote`); `label` can never be empty (throw).
- `setExerciseField(def, slot, blockKey, exId, field, value)` — `field` ∈
  `name, presc, sets, detail, video, pattern, altName, altVideo, pctMin,
  pctMax, unit`. Numbers (`sets, pctMin, pctMax`) are coerced and must be
  finite positives or the field is removed. **`id` and `type` are not
  editable** — throw if asked.
- `listEditable(def)` → the tree the UI renders: slots in `def.slots` order →
  blocks → exercises, each with the fields above. Retired blocks (see Facts)
  are included and marked `retired: true`, read-only in the UI.

Everything not named above (schedule, testing, daily, mobility, tracking,
slotMeta, slotOptions, programView, …) passes through **untouched**. A test
proves it: start a draft from each fixture row, change nothing, and the
result must deep-equal the input.

### 2. Editor UI — new `src/editor.jsx`, wired from `PersonPanel`

- A second collapsible panel beside the Publisher: **"Edit programme"**.
- On open: `startDraft` for that client, for **tomorrow's** date (same
  default the Publisher uses). Shows "Based on: <name> (in force from
  <date>)".
- Renders `listEditable`: slot → block → exercise. Text inputs for the
  editable fields; retired blocks greyed and read-only.
- Effective-date input (defaults to tomorrow), **Check** button → runs
  `preflight` with `text: JSON.stringify(draft)`, shows `blocking` and
  `warnings` exactly as the Publisher does. Any edit clears a previous check
  (the Publisher's `edit()` pattern).
- **Publish** appears only after a passing check → `insertProgramVersion` →
  `onPublished()`.
- Reuse the Publisher's result/warning rendering. If that means extracting a
  small shared component from `app.jsx`, do it; do not duplicate it.
- The paste Publisher stays. It is the fallback route for 8 Nov.

### 3. Tests — new `verify-editor.mjs`

Last line `N passed, 0 failed`, like the client gates. At minimum:

- round trip: every fixture row → `startDraft` → no edits → deep-equal;
- each setter changes exactly one field and nothing else (deep-equal the
  rest);
- inputs are never mutated;
- `id` / `type` edits throw; empty `label` throws; empty `subtitle` removes
  the key;
- a draft with an edited `presc` passes `preflight` (use `today` = 28 Sep
  2026, `effectiveFrom` = a future date, the fixture rows and logs);
- renaming an exercise to a different movement (e.g. "Bulgarian split squat"
  → "Leg press") on a **logged** ID is **blocked by preflight** — proves the
  editor cannot bypass ID permanence;
- `startDraft` for a client with no version in force returns `null`.

Extend `verify-render.mjs` (keep its bundling method): the editor panel
renders collapsed and open for each fixture client without throwing, and
retired blocks render read-only.

## Out of scope (3b / 3c)

Adding, removing or reordering exercises or blocks; minting IDs; cardio
targets, `hrZones`, `cardioTypes`; diffs; draft persistence; schedule,
testing, daily, mobility. Any Supabase change. Any client repo.

## Gates

```
npm install
node verify.mjs                 # ALL CHECKS PASSED
node verify-adherence.mjs       # N/N
node verify-publish.mjs         # N/N
node verify-recovery.mjs        # 0 failed
node verify-validator.mjs       # ALL CHECKS PASSED
node verify-editor.mjs          # 0 failed  (new)
npx esbuild verify-render.mjs --bundle --loader:.jsx=jsx --platform=node \
  --format=esm --outfile=render.bundle.mjs --external:react --external:react-dom \
  && node render.bundle.mjs && rm render.bundle.mjs     # all passed
npm run build                   # only after all of the above pass
```

Also: `md5sum src/core/engine.js src/core/program-schema.js` unchanged
(`a1ab926a…`, `e67329ea…`). Do not commit `package-lock.json` changes that
`npm install` makes on its own. `COACH_VERSION` → `0.6.0`.

## Done means

One Coach PR, containing the code, the rebuilt `bundle.js`/`styles.css`, and
`briefs/reports/step9-phase3a-editor-core-report.md`.
