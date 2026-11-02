# Step 9 · Phase 6 — standard slots, non-cardio sports, cardio-type picker

Status: **READY, but runs after Phase 4 merges.** Both phases edit
`program-schema.js`. Written 1 Oct 2026 from live `main` (clients
5.6.0-beta1, Coach 0.11.0, plus the Phase 4 brief at `02f5bbb`). If Phase 4
has merged, start from its `main` and re-check every fact below against it.
Branch: the session's own (see README).
Versions: clients → **`5.8.0-beta1`**; Coach → **`0.12.0`**, with the
`index.html` `?v=` cache-bust.

## Why

Henna and Joonatan cannot get a planned walk or cardio session. Their
programmes have no slot for one, and the Coach editor can add a block only
inside an existing slot. John wants a standard set of slots available for
every client, so a programme for a new client is built from the same pieces.
The same work fixes two gaps found on 1 Oct:
- yoga minutes count as cardio;
- the cardio-type "sports" field is free text, so a typo like
  "Assault bike" silently never matches a workout.

## Decisions (John, 1 Oct 2026)

1. **Standard slots: Strength, Run, Walk, Swim, Bike, Yoga, Cardio.**
   - Cardio means mixed, interval or gym cardio (e.g. Juha's 4×4 and Zone 2).
   - Run, Bike and Swim are for sport-specific sessions.
2. **Catalogue, not padding.** The seven live in one shared catalogue. The
   Coach editor always offers all seven. A slot is written into a client's
   programme only when John adds it; programmes are not padded with empty
   slots.
3. **Client-specific extra slots stay allowed.** Juha's **Tennis** is one.
   Existing slot ids are never renamed: logged history resolves through them.
4. **Yoga is logged but is not cardio.** It adds 0 to the weekly cardio
   total, as strength does. **Strength and Yoga are the two non-cardio
   slots**; every other slot, standard or client-specific, counts as cardio.
5. Earlier decisions still hold:
   - a strength workout on a planned strength day gets a single OK
     (acknowledge only);
   - on other days it appears as a "not cardio" extra;
   - planned cardio confirms write minutes to `durationTaskId`, never an
     activity.

## Facts (verified 1 Oct 2026)

### Live slots

| Client | Slots |
|---|---|
| Henna | `strength, yoga` |
| Joonatan | `strength` |
| Ville | `strength, run, bike, yoga` |
| Juha | `strength, cardio, tennis, yoga` |

Every existing id already matches a standard id, except Juha's `tennis`.
**No data migration is needed.**

### Validator (`program-schema.js`), for each slot

- `slotMeta` needs `label` and a `#rrggbb` `color`. Any key other than
  `label`, `color`, `cat` raises a warning.
- `blocks[slot]` must be an object. Empty `{}` passes.
- `slotOptions[slot]` must be non-empty and should contain
  `{ value: null }`.
- A `cardioTypes[].slot` must be in `slots`.

### Client apps

- A delivered slot the bundle never compiled renders correctly
  (`verify-program-delivery.mjs`, "a delivered slot the bundle never
  compiled").
- A section's colour is `CATS[section.cat] || CATS.check`, and a block's
  `cat` defaults to its slot name. So a Run block in Henna's app today
  falls back to the grey "check" colour and the dumbbell icon. `CATS` is
  **client data**: it is built by `catsFor()` in each `config.jsx` and
  passed to `buildTheme`.

Categories each client defines today:

| Client | Categories |
|---|---|
| Henna | strength, mobility, yoga, check, rest, activity |
| Joonatan | strength, mobility, check, rest, activity, yoga |
| Ville | strength, run, bike, yoga, mobility, check, rest, activity, testing |
| Juha | strength, cardio, tennis, yoga, mobility, nutrition, check, rest, activity, testing |

**Owner rule:** Henna's colours must not change. More generally, no existing
category colour changes for any client.

### `app.jsx` — Calendar

The Calendar legend (~line 2502) and the day panel (~line 2546) list every
slot in `PROGRAM.slots`, including one whose only option is "None".

### `cardio.js` (`4fdcbaf1`)

- `STRENGTH_SPORTS = ["strengthTraining"]`.
- `matchDay` returns `{ planned, extras, strength }`.
- `isCardioActivity(a)` is false only for `kind: "strength"`.
- `weeklyCardioMinutes` skips only the `strength` slot.

Yoga therefore counts as cardio today, in the client apps and in Coach
Overview, because both call the same function.

### Coach editor (`src/core/editor.js`)

- `addBlock` throws when the slot does not exist, and there is no
  "add slot" operation.
- `setCardioTypes` stores `sports` as free text.
- Live example: Joonatan's `joonatan-2026-10-03` carries sports
  `["Assault bike"]` and `["Bike"]`. Neither is a sport code, so neither
  will ever match.

### Sport codes seen in `wearable_workouts`

`running`, `walking`, `hiking`, `cycling`, `swimming`, `yoga`,
`strengthTraining`, `HIIT`, `stairExercise`, `elliptical`,
`cardiovascularExercise`, `tennis`, `paddleSports`, `climbing`, `golf`,
`sailing`, `stretching`, `houseWork`, `yardwork`, `other`. Polar rows are
mapped to the same codes.

## Scope

### 1. Shared catalogue — `program-schema.js` (all five repos, byte-identical)

Export `STANDARD_SLOTS`: `{ id, label, color, countsAsCardio, sports }`
for the seven slots.

- **`id`**: `strength`, `run`, `walk`, `swim`, `bike`, `yoga`, `cardio`.
- **`countsAsCardio`**: false for `strength` and `yoga`, true for the rest.
- **`sports`** (the default watch-sport codes that belong to the slot):

  | Slot | Sport codes |
  |---|---|
  | run | `running` |
  | walk | `walking`, `hiking` |
  | swim | `swimming` |
  | bike | `cycling` |
  | yoga | `yoga` |
  | cardio | `HIIT`, `stairExercise`, `elliptical`, `cardiovascularExercise` |
  | strength | `strengthTraining` |

- **`color`**: the `slotMeta` default for a newly added slot. Reuse colours
  already in the system where they fit (yoga `#A99BC9`, cardio `#4CB6C4`
  as on Juha's slot). Pick the rest so that each is distinct within the
  catalogue and passes `verify-theme.mjs` contrast in both themes. Report
  the values chosen.

Also export:
- `KNOWN_SPORTS`: the codes above;
- `NON_CARDIO_SLOTS = ["strength", "yoga"]`.

Validator additions:
- **Warning** when a `cardioTypes[].sports` entry is not in `KNOWN_SPORTS`.
  Not an error: a new watch sport must not block publishing.
- **Error** when a cardio type lists a non-cardio sport (`strengthTraining`,
  `yoga`). Strength and yoga are never cardio types.

### 2. Non-cardio sports — `cardio.js` (all five repos, byte-identical)

Generalise Phase 5b's strength rule to every non-cardio slot.

- **`matchDay`** returns `{ planned, extras, nonCardio }`. `nonCardio` is
  a list of `{ workout, slot }` for every workout whose sport belongs to a
  non-cardio slot (via `STANDARD_SLOTS[].sports`). The same dedupe,
  recorded-session, dismissed and confirmed filtering applies.
- **`activityFromWorkout`**: a non-cardio workout gets `kind: <slot>`
  (`"strength"` or `"yoga"`), and `name` from the catalogue label.
  Existing `kind: "strength"` entries stay valid.
- **`isCardioActivity(a)`**: false when `a.kind` is in `NON_CARDIO_SLOTS`.
- **`weeklyCardioMinutes`**: skips every slot in `NON_CARDIO_SLOTS`.

Keep the existing exports working for one release: `isStrengthWorkout`,
`STRENGTH_SPORTS`.

### 3. Client app — `app.jsx` (four clients, byte-identical)

- **Matches.** Replace the `strength`/`strengthOnPlan` handling with
  `nonCardio`.
  - If the day has that slot scheduled (not skipped), offer the workout
    inside that block with a single **OK** (acknowledge only, as today for
    strength).
  - Otherwise list it under Recorded as "`<Label>` · not cardio". Confirm
    writes the `kind` entry.
  - A confirmed non-cardio extra shows "not cardio".
- **Calendar.** Leave out of the legend and the day panel any slot with no
  selectable session (only `{ value: null }` options). Still show it on a
  day where that slot has a value, so history stays visible.

### 4. Standard categories — new `src/core/categories.jsx` (four clients, byte-identical)

Export `standardCats({ ACCENT, ACCENT_2 })`, returning a category (label,
colour, Icon) for each standard slot. Use the catalogue colours and these
icons from the existing `lucide-react`:

| Slot | Icon |
|---|---|
| strength | `Dumbbell` |
| run | `Activity` |
| walk | `Footprints` |
| swim | `Waves` |
| bike | `Bike` |
| yoga | `Flower2` |
| cardio | `HeartPulse` |

Check that each icon exists in the pinned version. If one is missing, pick
the nearest and report it.

In each client's `config.jsx`, change `catsFor` to
`{ ...standardCats(theme), ...<existing object> }`, so **every existing
entry wins** and only missing categories are filled. Henna's rendered
colours must be byte-identical to today: prove it in the test.

### 5. Coach editor

- **Add slot.**
  - A picker lists the standard slots not yet in the programme, plus
    "Custom slot…" (id, label, colour) for client-specific ones like
    Tennis.
  - Adding a slot appends it to `slots` and writes `slotMeta` (catalogue
    label and colour), `blocks[slot] = {}` and
    `slotOptions[slot] = [{ label: "None", value: null }]`.
  - A pure function goes in `src/core/editor.js` (it returns a new
    definition and never mutates); the UI goes in `src/editor.jsx`.
  - An existing slot id can never be renamed or removed from a programme
    that has logged history. Removing a slot is out of scope.
- After a slot is added, "+ Add block", the week board and the cardio
  target panel work as for any slot. The cardio target panel shows only
  for `countsAsCardio` slots.
- **Cardio types.**
  - `sports` becomes a multi-select of `KNOWN_SPORTS`, with a "custom
    code" text input that shows the validator warning.
  - The Slot dropdown lists only cardio slots.
  - New button "Use standard cardio types": fills Run, Walk, Bike, Swim and
    Cardio from the catalogue, each linked to its slot when the programme
    has that slot, otherwise extras-only.
- Copy `program-schema.js` and `cardio.js` byte-identical.
- Bump `COACH_VERSION` and the `?v=`.

### 6. Version and build

Set `APP_VERSION` to `5.8.0-beta1` in each `src/core/program-<client>.js`,
then `npm run build` in all five repos.

## Out of scope

- Any Supabase write. Adding slots or types to live programmes is John's
  work in the editor after deploy.
- Removing or renaming slots.
- A "new client" template (onboarding is a later step).
- Changing any existing category colour.
- `engine.js` (must stay `c3eb98c2`).
- A manual "Other" extra typed as "Yoga" in the Calendar form still counts as
  cardio: that is the client's free-text choice; list it under Open.

## Tests and gates

### `test-cardio.mjs` (four clients, identical) gains at least

- a yoga workout goes to `nonCardio` with `slot: "yoga"`, never to `planned`
  or `extras`;
- strength behaviour is unchanged;
- confirmed yoga adds 0 minutes, and a cardio extra the same day still
  counts;
- a planned yoga block with a `durationTaskId` adds 0;
- legacy `{ id, name }` and existing `kind: "strength"` entries behave as
  before;
- the validator errors on a `strengthTraining` or `yoga` cardio type, and
  warns on an unknown sport code.

### `test-cardio-client.mjs` gains at least

- yoga on a planned yoga day → OK only, no write but the key;
- yoga on another day → one `kind: "yoga"` activity;
- the Calendar hides an option-less slot but shows it on a day that has a
  value.

### Category test (new or extended)

For every client and both themes, every category that existed before has
the same colour and the same icon. Henna in full.

### Coach

- `verify-editor.mjs`:
  - add each standard slot and a custom slot to each fixture programme;
  - the result passes `validate()` with 0 errors;
  - adding an existing id throws;
  - "Use standard cardio types" output validates;
  - Joonatan's live-style `["Assault bike"]` produces a warning, not an
    error.
- `verify-overview.mjs`: a week with yoga plus a cardio extra shows only
  the cardio minutes.
- All other Coach gates pass.

### Gates

Every existing gate in every repo ends `0 failed`, plus `npm run build`.

### Browser check

Headless Chromium, as in Phase 5, saved to
`briefs/reports/step9-phase6-standard-slots/`:
- **Client (Henna build):**
  - a delivered programme with a new Walk slot and block: the Walk session
    shows in Today with the walk colour and icon;
  - the Calendar hides empty slots;
  - a yoga watch workout behaves as decided.
- **Coach:** add a Walk slot to a Henna fixture, add a block, place it on
  Tue/Thu, Check passes.

### Byte-identical

- `app.jsx`, `categories.jsx`, `test-cardio.mjs`, `test-cardio-client.mjs`
  across the four clients;
- `program-schema.js` and `cardio.js` across all five repos.

Report the new hashes.

## Stop rules (beyond the README)

- Any existing category colour or icon would change → stop.
- `engine.js` would need a change → stop and report.
- Phase 4 is not merged on `main` → stop before editing `program-schema.js`.
- A decision not covered here (for example, whether Walk should be offered
  as a planned slot for an existing client automatically) → stop and ask.
  Do not decide.

## Done means

- One PR per repo (five), not merged.
- A report at `briefs/reports/step9-phase6-standard-slots-report.md`,
  covering:
  - result, changes, gates and hashes;
  - the catalogue colours chosen;
  - open items.

Chat verifies every branch before John merges, in the order Henna →
Joonatan → Ville → Juha → Coach.
