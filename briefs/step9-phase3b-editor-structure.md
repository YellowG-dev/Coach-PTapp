# Step 9 · Phase 3b — Coach editor: structure and cardio

Status: **READY** · written 29 Sep 2026 from Coach `main` at `2aadd7a`
(Coach 0.6.1). Branch: the session's own (see README).

## Why

3a edits existing fields. Block 2 for Ville (starts 16 Nov, target authored
by **8 Nov**) needs new exercises, changed sessions and cardio targets. 3b
adds exactly that, on the same pure-model + existing-publish path.

## Repos

`Coach-PTapp` only. Do **not** edit `engine.js`, `program-schema.js`,
`cardio.js` (byte-identical to the clients: `a1ab926a…`, `e67329ea…`,
`35e010b3…`). The client validator already accepts everything this brief
produces (`hrZones`, `cardioTypes`, `block.cardio` — Phase 2).

## Facts this brief rests on (verified 29 Sep 2026)

- `src/core/editor.js` exports `startDraft`, `setBlockField`,
  `setExerciseField`, `listEditable`; every function returns a new
  definition and never mutates. **Keep that contract** for everything below.
- `src/editor.jsx` `ProgrammeEditor` renders `listEditable(draft)`; Check →
  `preflight({ text: JSON.stringify(draft), … })`; Publish →
  `insertProgramVersion`. The `blanks` pattern keeps Check disabled while a
  required field is empty. Reuse it.
- A block is *retired* when its key is not a `value` in `slotOptions[slot]`.
- **Exercise IDs are shared on purpose** when the movement is the same, across
  blocks and across versions (verified in the live data: `up-5` is in Juha's
  `strength/a` and `strength/upper`; `cv-hr-peak` in `cardio/hard` and
  `tennis/social`). History is keyed by ID, so the same movement must keep its
  ID. ID styles vary (`up-5`, `a2`, `hip-thrust`, `run-dur`) — do not
  normalise existing IDs.
- `preflight` already blocks reuse of a **logged** ID for a different
  movement (`validate-program.js`). The editor must not rely on that alone:
  it should never *create* that situation.

## Scope

### 1. Pure model additions — `src/core/editor.js`

**Exercise catalogue**
- `catalogue(rows, personId)` → every distinct exercise this client has ever
  had, across **all** their versions: `{ id, name, type, … latest fields }`,
  latest version winning for the fields. Used by "Add existing".

**Exercises**
- `addExistingExercise(def, slot, blockKey, catalogueEntry, index?)` — inserts
  a copy of the entry **with its original `id`** (same movement, history
  stays joined). Refuse (throw) if that id is already in this block.
- `addNewExercise(def, slot, blockKey, { name, type = "exercise", … }, takenIds)`
  — mints the id: `slugify(name)` (lowercase, a–z0–9 and `-`, max 32
  chars); if taken, append `-2`, `-3`, … `takenIds` = every id in **every
  version** of this client **plus** every id in their logs (the caller
  builds it; use `collectLoggedIds` from `validate-program.js`). `name`
  required. `type` ∈ `exercise` | `number` (with `unit`); other types are out
  of scope.
- `removeExercise(def, slot, blockKey, exId)` — removes it from that block
  only. History is untouched (logs keep the id).
- `moveExercise(def, slot, blockKey, exId, delta)` — `delta` ±1, clamped.

**Blocks**
- `addBlock(def, slot, label)` — key = `slugify(label)`, unique within the
  slot (suffix `-2`…); creates `{ label, exercises: [] }`; appends
  `{ label, value: key }` to `slotOptions[slot]`. Label required.
- `retireBlock(def, slot, key)` — removes its entry from `slotOptions[slot]`
  only; the block stays in `blocks` so past days still resolve. Refuse if it
  is the last non-null option in the slot.
- `restoreBlock(def, slot, key)` — puts it back in `slotOptions[slot]`.
- **No block deletion.** Ever.

**Cardio (Phase 2 shape)**
- `setBlockCardio(def, slot, key, patch)` — merges into `block.cardio`
  (`durationMin, distanceKm, zoneAvg, zoneMax, pace, note, durationTaskId`);
  empty values remove the field; an empty object removes `cardio`.
- `setHrZones(def, zones)` and `standardHrZones()` → `[PK1 60–70, PK2 70–80,
  VK 80–90]` (% of max HR, decided by John 28 Sep: one table per client,
  resolved with Settings → Max HR).
- `setCardioTypes(def, types)` — the coach's list for extra cardio
  (`{ id, label, sports[], slot? }`; id `other` reserved).

### 2. UI — `src/editor.jsx`

- Per block: **Add existing** (picker from `catalogue`, searchable by name),
  **Add new** (name + type), per-exercise **Remove** and **↑/↓**.
- Per slot: **Add block** (label). Per block: **Retire** / **Restore**.
- Per block in a non-strength slot: a **Cardio target** group — duration
  (min), distance (km), avg zone / max zone (dropdowns from `hrZones`;
  disabled with a hint if the programme has none), pace (m:ss), note,
  duration field (dropdown of this block's exercise ids of type `number`).
- Programme-level: **Heart-rate zones** table (with "Use standard PK1/PK2/VK")
  and **Cardio types** list.
- Every change clears a previous Check (same as 3a).
- Removing an exercise or retiring a block shows a one-line confirmation
  saying history is kept.

### 3. Tests — extend `verify-editor.mjs`

At minimum, all against `fixtures/programs.json` and the log fixtures:
- every new function returns a new object and leaves its input unchanged;
- `addExistingExercise` keeps the original id; refuses a duplicate in block;
- `addNewExercise` never returns an id present in any version or any log
  (test with a name whose slug collides, e.g. an existing slug id);
- add → remove → round-trips to the original definition (deep-equal);
- `moveExercise` clamps at both ends;
- `addBlock` adds a `slotOptions` entry; `retireBlock` removes only that entry
  and keeps the block; `restoreBlock` reverses it; retiring the last option
  throws;
- a draft with a new block, a new exercise, `hrZones` (standard) and a
  `block.cardio` using `zoneAvg: "PK1"` **passes `preflight`**;
- the same draft with `zoneAvg: "PK9"` is **blocked** by `preflight`;
- the exercise "Bulgarian split squat" added to a new Ville block via
  **Add existing** keeps id `bss` and passes preflight.

Extend `verify-render.mjs` (keep its bundling method): editor open renders the
new controls for each fixture client without throwing.

## Out of scope

Schedule (moved to 3c — decided by John 29 Sep 2026: 3c = the weekly
schedule editor first, then the diff view and saved drafts), testing, daily
sections, mobility, slotMeta, new **slots**, any client repo, any Supabase
write.

## Gates

```
npm install
node verify.mjs; node verify-adherence.mjs; node verify-publish.mjs
node verify-recovery.mjs; node verify-validator.mjs
node verify-editor.mjs                 # 0 failed
npx esbuild verify-render.mjs --bundle --loader:.jsx=jsx --platform=node \
  --format=esm --outfile=render.bundle.mjs --external:react --external:react-dom \
  && node render.bundle.mjs && rm render.bundle.mjs
npm run build
```
Hashes of `engine.js`, `program-schema.js`, `cardio.js` unchanged. Do not
commit `package-lock.json` changes from `npm install`. `COACH_VERSION` →
`0.7.0`.

## Done means

One Coach PR with code, rebuilt `bundle.js`/`styles.css`, and
`briefs/reports/step9-phase3b-editor-structure-report.md`.
