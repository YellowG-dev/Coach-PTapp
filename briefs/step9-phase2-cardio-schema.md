# Step 9 · Phase 2 — repeatable cardio: data shape, no UI

Status: **READY** — all decisions closed 28 Sep 2026. Touches different files from Phase 0 (no `app.jsx`, no `package.json`), so it may run in parallel with it.
Branch: `step9/phase2-cardio-schema`.

## Why this comes before the editor

The Coach editor (Phase 3) can only offer what the schema can express. If the
cardio shape lands after the editor, the editor is reopened and re-tested. So
this phase fixes the data shape, the validator and the pure logic, and ships
**no UI**.

## Decided with John, 28 Sep 2026

1. **Planned cardio stays as it is**: one slot per sport (`run`, `bike`,
   `cardio`, `tennis`, `yoga`…), sessions as blocks, placed on days by the
   schedule. HIIT/Norwegian blocks keep their current form (interval
   checkmarks, average and peak HR typed in). **No change to how planned
   blocks log.**
2. **Planned cardio blocks may carry a structured target**: duration,
   distance, average-HR zone, max-HR zone, pace, note. All optional.
3. **Extra cardio, any number per day**: chosen from a coach-defined list or
   "Other" with a client-typed name.
4. **Zones resolve through the client's max HR in Settings** (already exists:
   `settings.hrMax`, used by `withBpm`). Nothing about max HR moves into the
   programme.
5. **Wearable results**: the app proposes a match; the client confirms.
   - A workout that matches a planned block on that day → offered as prefill
     for that block.
   - A workout that matches nothing planned → shown on **any** day as a
     *recorded* (not planned) entry, with its own marker.
   - Unconfirmed workouts are shown but **count for nothing** until confirmed.
6. **What counts as a recorded workout**: Oura `workout_heart_rate` and
   `manual` only. Oura `autodetected` and `confirmed` are ignored entirely —
   not shown, not counted. This is exactly what `isRealSession()` in
   `wearables.js` already does (verified 28 Sep); reuse it, do not re-derive.
7. **Duplicates**: the same session from two vendors counts once. Polar wins
   over Oura.
8. **Pace is never stored for results**; it is derived from duration and
   distance. Pace exists only as a *target*.
9. **Weekly cardio total** in minutes, of confirmed entries: **planned cardio
   sessions (their logged duration) plus extras**, counted once each.
10. **One zone table per client**, as percentages of max HR, resolved with the
    max HR the client sets in Settings. Each client has one programme, so the
    table lives in that client's programme definition (`hrZones`); every
    version of that client's programme carries it. **Exception:** Ville's bike
    keeps fixed-bpm prescription text (his bike max is 173 vs 180 running) and
    gets no zone target in v1.

## Facts this design rests on (verified 28 Sep 2026)

- Extra activities already exist: `overrides[day].activities = [{ id, name }]`
  (`app.jsx` `addActivity`), rendered by `engine.js buildSections` as an
  "Extra Activity" section. This phase **extends that shape**; it does not add
  a second mechanism.
- Coach reads them in `src/core/shape.js` and keeps only entries with a
  `name` → every new entry **must keep `name`**.
- `wearable_workouts` already has `vendor, vendor_session_id, sport, source,
  started_at, day, duration_minutes, distance_km, hr_avg, hr_max`.
- Oura workouts carry **no heart rate** (the sync writes `hr_avg/hr_max =
  null`; zero of 831 stored Oura workouts have HR). An Oura-only walk will have
  duration (and sometimes distance) but no zone.
- Oura `sport` values seen in stored data: `running, walking, cycling,
  stairExercise, HIIT, tennis, yoga, elliptical, strengthTraining, hiking,
  swimming, other…`. Polar values are **unknown until Phase 1** — the mapping
  table must accept Polar sport names later without a code change.
- **Coach publishes without running the client validator.** `publish.js`
  calls only `validateProgramEdit` (ID permanence); it never imports
  `program-schema.js`. A Coach-published definition can therefore pass Coach
  and be rejected by the client — the same failure as Ville's 15 errors in
  Step 8. Closed in this phase (item 4 below).

## Scope

### 1. Definition additions — `program-schema.js` (all optional, additive)

```js
hrZones: [                       // the client's one zone table, % of max HR
  { id: "PK1", label: "PK1", pctMin: 60, pctMax: 70 },
  { id: "PK2", label: "PK2", pctMin: 70, pctMax: 80 },
  { id: "VK",  label: "VK",  pctMin: 80, pctMax: 90 },
],

cardioTypes: [                   // the coach's list for extra cardio
  { id: "run",    label: "Run",    sports: ["running"],       slot: "run" },
  { id: "walk",   label: "Walk",   sports: ["walking"] },
  { id: "stairs", label: "Stairs", sports: ["stairExercise"] },
],                               // "Other" is implicit, never listed

// on any block, in any slot:
blocks.run.easy.cardio = {
  durationMin: 45, distanceKm: 8,
  zoneAvg: "PK1", zoneMax: "PK2",
  pace: "5:45",                  // min:ss per km, target only
  note: "Flat route",
  durationTaskId: "run-dur",     // which task in this block logs its minutes
}
```

`slot` on a cardio type means "a workout of this sport satisfies that planned
slot"; without it the type is extras-only.

Validator rules — **errors** (client must not run it):
- `hrZones`: array; ids unique non-empty strings; `0 < pctMin < pctMax <= 100`.
- `cardioTypes`: array; ids unique; `label` non-empty; `sports` array of
  strings; `slot`, if present, is in `slots`; id `other` is reserved.
- `block.cardio`: an object; numbers positive where present; `pace` matches
  `^\d{1,2}:[0-5]\d$`; `zoneAvg`/`zoneMax` must be ids in `hrZones`;
  `durationTaskId`, if present, is the id of a task in that block's
  `exercises`.

**Warnings**: a sport listed under two cardio types; `cardio` on a block whose
slot is `strength`.

Add `hrZones` and `cardioTypes` to `OPTIONAL_KEYS`. Bump nothing else. Keep
`SCHEMA_VERSION = 2` — every addition is optional, and an older client that
sees these keys only warns (verified: unknown keys go to `warnings`).

### 2. Log shape — extend `overrides[day].activities[]`

```js
{ id, name,                       // unchanged, both still required
  typeId: "walk" | null,          // null = Other / legacy entry
  durationMin, distanceKm, hrAvg, hrMax,   // all optional numbers
  source: "manual" | "wearable",
  workout: { vendor, vendorSessionId } }   // only when source = wearable
```

Old `{ id, name }` entries stay valid and count **0 minutes**.
Declined suggestions: `overrides[day].dismissedWorkouts = ["polar:<id>", …]`
so a dismissed workout is not offered again. Nothing is written for a
suggestion until the client confirms or dismisses it — the day log stays the
source of truth; suggestions are computed on read.

### 3. Pure logic — new `src/core/cardio.js`

No React, no Supabase, no `Date.now()` without an injectable clock.

- `isRealSession(w)` **moves here** unchanged, and `wearables.js` re-exports
  it (`export { isRealSession } from "./cardio.js"`). Reason: `wearables.js`
  imports `supabase.js` and `config.jsx`, so importing *from* it would make
  `cardio.js` untestable in plain `node`. Behaviour must not change;
  `test-wearable-scope.mjs` proves it.
- `recordedWorkouts(workouts)` → `workouts.filter(isRealSession)`.
- `dedupe(workouts)` → same day and overlapping time windows
  (`started_at` … `started_at + duration_minutes`) collapse to one; Polar kept.
- `matchDay(date, info, workouts, program, overrides)` →
  `{ planned: { [slot]: workout }, extras: [workout] }`, excluding dismissed
  and already-confirmed workouts. Sport → slot via `cardioTypes[].slot`.
- `zoneBpm(zoneId, hrMax, program)` → `{ lo, hi }` or `null` (no max HR, no
  zone table, unknown id).
- `weeklyCardioMinutes(weekStart, log, overrides, programOrResolver)` →
  minutes of (a) planned cardio sessions logged that week — the logged
  duration of a block in a non-strength slot, read from the block's duration
  task (e.g. `run-dur`, stored as minutes) — plus (b) confirmed extras. A
  planned session with no logged duration counts 0; never estimate. Which task
  holds a block's duration must come from the definition, not from an ID
  pattern: add optional `durationTaskId` to `block.cardio` and use it; if a
  block has none, it counts 0 and the test says so. Score each day against the
  programme in force on that day (resolver), as the rest of the engine does.
- `pace(durationMin, distanceKm)` → `"m:ss"` or `null`.

Also export `activityFromWorkout(workout, program)` → the log entry written on
confirm, with `name` taken from the cardio type label or the sport.

### 4. Coach runs the client validator before publishing

Copy `program-schema.js` into `Coach-PTapp/src/core/` **byte-identical** to
the client copy. In `publish.js preflight`, run `validate()` on the parsed
definition; any error **blocks** publishing and is shown; warnings are shown.
This is what makes "one contract" true rather than intended.

## Out of scope

Any UI (Phase 5). `app.jsx` and `engine.js` are **not** edited;
`wearables.js` only gains the one re-export line. Polar field
mapping (Phase 1). Writing any definition to Supabase — code ships first, data
second (Step 8 lesson).

## Tests and gates

New `test-cardio.mjs` in each client repo (identical file), covering at least:
validator accepts each existing programme unchanged; validator errors for each
rule above; `isRealSession` filtering (autodetected and confirmed Oura
excluded); dedupe with an overlapping Polar+Oura pair and a non-overlapping
pair; match to a planned slot vs extra; dismissed and already-confirmed
workouts not re-offered; legacy `{id,name}` activity counts 0 minutes;
`zoneBpm` with and without max HR.

Coach: extend `verify-publish.mjs` — a definition with a schema error is
blocked; every definition in `fixtures/programs.json` passes (if one does
not, stop and report — do not edit the fixture to make it pass).

All existing gates must still end `0 failed`. Byte-identical across the four
client repos **and Coach**: `program-schema.js`. Across the four client repos:
`cardio.js`, `test-cardio.mjs`.

Also in `test-cardio.mjs`: weekly total = planned logged duration + confirmed
extras across a week that crosses a programme-version boundary; a planned
block without `durationTaskId` counts 0.

## Decisions log

- A (28 Sep): weekly total = planned cardio + extras.
- B (28 Sep): one zone table per client, % of Settings max HR; Ville's bike
  is the exception (fixed bpm text, no zone target in v1).

Writing `hrZones` into the live programmes is **data**, done from chat after
this code is deployed to all four clients — not in this session.
