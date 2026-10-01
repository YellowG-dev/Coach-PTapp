# Step 9 · Phase 5b — wearable strength workouts, outside cardio

Status: **READY** · written 1 Oct 2026, after chat verified the Phase 5
branches (`claude/cardio-client-phase5-c9598v`: all gates `0 failed`, rebuilds
byte-identical, hashes as reported).
**Runs on the same five branches as Phase 5, before anything merges.** Push
onto `claude/cardio-client-phase5-c9598v` in each repo so the five open PRs
update. Do not open new PRs. Versions stay **5.6.0-beta1** and Coach
**0.11.0**, because none of this has been deployed.

## Why

Chat verification found a gap that Phase 2 and the Phase 5 brief both missed:
nothing keeps strength workouts out of cardio. `matchDay` sorts
`strengthTraining` into `extras` (no cardio type claims it), so the client is
offered its own gym session as a recorded cardio extra, and confirming it adds
its minutes to the weekly cardio total. Real volume, last 30 days: Juha
17 Oura strength workouts; Ville 8 Oura and 8 Polar.

## Decisions (John, 1 Oct 2026)

- **Strength workouts are offered, but outside cardio.** They never count
  toward cardio minutes, in the client or in Coach.
- **Planned strength day:** the workout is offered inside the strength block.
  Confirm only acknowledges it. It writes no ticks, no numbers and no
  `activities[]` entry, and records the key so it is not offered again.
- **Any other day** (no strength slot, or a skip day): offered under Recorded,
  marked "Strength · not cardio". Confirm writes a strength extra that never
  counts toward cardio minutes.
- The four Phase 5 judgement calls are **accepted as built**: confirms are
  remembered in `dismissedWorkouts`; "Keep mine" never overwrites a typed
  duration; a planned match with no target falls back to Recorded; skip-day
  extras tick the Today ring.

## Facts (verified 1 Oct 2026 on the Phase 5 branches)

- Both vendors store strength as `sport = "strengthTraining"` (Oura and
  Polar rows in `wearable_workouts`).
- `cardio.js` `35e010b3`: `matchDay` returns `{ planned, extras }`.
  `weeklyCardioMinutes` adds `durationMin` of every `activities[]` entry, with
  no check on what kind of activity it is. `activityFromWorkout` has no kind
  field.
- Client `app.jsx` calls `matchDay` only through `splitMatches` (~line 211).
- Coach imports `weeklyCardioMinutes` in `src/core/overview.js` (line 25,
  used ~211). Coach does not call `matchDay` or `activityFromWorkout`.
  `overview.js` ~line 208 sets `extras = true` for any activity with a
  numeric `durationMin`.
- Coach Overview already treats `strengthTraining` as matching the strength
  slot (~line 486). Keep that behaviour.

## Scope

### 1. `cardio.js` — all five repos, byte-identical

- `export const STRENGTH_SPORTS = ["strengthTraining"];` and
  `export function isStrengthWorkout(w)`.
- `matchDay` returns `{ planned, extras, strength }`. A strength workout
  never goes into `planned` or `extras`. It goes into `strength`, after the
  same dedupe, recorded-session, dismissed and confirmed filtering as every
  other workout.
- `activityFromWorkout`: a strength workout gets `kind: "strength"`, and
  `name` from the sport label ("Strength training"). Every other field is
  unchanged.
- `export function isCardioActivity(a)` → `false` when `a.kind ===
  "strength"`, otherwise `true`. `weeklyCardioMinutes` counts an activity's
  `durationMin` only when `isCardioActivity(a)`.
- Update the file's comments to match the new behaviour.

### 2. Client `app.jsx` — four clients, byte-identical

- `splitMatches` handles `strength`. If the day has a strength slot
  scheduled (not skipped), the workout is offered **inside the strength
  block's card**, labelled as a recorded strength session. Confirm calls
  `dismissWorkout` only. Otherwise it goes into the Recorded group, marked
  "Strength · not cardio", and Confirm calls `confirmExtraWorkout`.
- Today and Calendar: an extra with `kind: "strength"` shows "not cardio"
  next to its details.
- Same behaviour on Today, Calendar and Train. Where the Train tab renders
  the strength block, the offer appears there as well.

### 3. Coach `overview.js`

Line ~208: `extras` is set only for activities where `isCardioActivity(a)`
and `durationMin` is numeric. Copy the new `cardio.js` byte-identical.

## Out of scope

`program-schema.js` (must stay `e67329ea`). `engine.js` (must stay
`c3eb98c2`, the Phase 5 version). Manual strength entry in the Calendar extras
form. Any change to how a planned strength block logs. Any Supabase write.

## Tests and gates

`test-cardio.mjs` (identical across the four clients) gains at least these
checks:
- a strength workout goes to `strength`, never to `planned` or `extras`, and
  Polar beats Oura in a strength duplicate;
- dismissed and confirmed strength workouts are not re-offered;
- `activityFromWorkout` sets `kind: "strength"`;
- a strength extra adds 0 to `weeklyCardioMinutes`, and a cardio extra on the
  same day still counts;
- `isCardioActivity` returns true for legacy `{ id, name }` entries.

`test-cardio-client.mjs`: a planned-strength-day confirm writes no activity
and no number; a non-strength-day confirm writes one activity with
`kind: "strength"`.

Coach `verify-overview.mjs`: a week with a confirmed strength extra plus a
cardio extra shows only the cardio minutes.

Every gate from Phase 5 must still end `0 failed`. Re-run the Phase 5 browser
check with a strength workout added on a planned strength day and on a rest
day, and add screenshots to `briefs/reports/step9-phase5-cardio-client/`
(names starting `6-`).

Byte-identical: `cardio.js` across all five (report the new md5);
`test-cardio.mjs`, `test-cardio-client.mjs`, `app.jsx` and `wearables.js`
across the four clients.

## Stop rules (beyond the README)

- `program-schema.js` or `engine.js` would need a change → stop and report.
- A strength workout needs to tick a planned exercise or set → that is not
  decided; stop and ask.

## Done means

The same five PRs, updated. Append a **Phase 5b** section to
`briefs/reports/step9-phase5-cardio-client-report.md` covering result,
changes, gates, hashes and open items. Chat then re-verifies all five
branches before John merges, in the order Henna → Joonatan → Ville → Juha →
Coach.
