# Step 9 · Phase 5 — cardio in the client apps

Status: **READY** · written 1 Oct 2026 from live `main` of all five repos
(Coach `c56226a`; clients Henna `5b523ec`, Joonatan `f696dcc`, Ville `385a5e6`,
Juha `6da5e46`). Branch: the session's own (see README).
Version: clients `5.5.3-beta1` → **`5.6.0-beta1`**; Coach → next minor
(`COACH_VERSION`, and the `index.html` `?v=` cache-bust).

## Why

Phase 2 shipped the cardio data shape and the pure logic (`cardio.js`) with no
UI, and nothing in `app.jsx` imports it yet. This phase is the client UI:
wearable matches the client confirms or dismisses, extra cardio on any day,
and planned cardio targets shown on the daily view. It also fixes D1.

## Repos

Henna-PTapp, Joonatan-PTapp, Ville-PTapp, Juha-PTapp (all four), plus
Coach-PTapp for the shared-file copy and one small display fix (item 6).
Read each client's `CLAUDE.md` first; its hard rules outrank this brief.

## Decisions (John)

- **D1 (1 Oct):** extras logged on a sick/travel/injured skip day **show** in
  Today and **count** toward the weekly cardio total. Planned slots stay
  cleared on a skip day.
- **D1 follow-up (1 Oct):** a skip day with extras does **not** become a
  training day. `isTrainingDay` stays computed from scheduled slots only on a
  skip day, so nutrition `byDayType` variants and the rest-day label behave as
  they do today.
- **D2 (1 Oct):** coach notes are not pushed to the app. Out of scope.
- From Phase 2 (28 Sep) and the 29 Sep Oura rule: unmatched recorded
  workouts show on any day as *recorded*; nothing counts until the client
  confirms; Polar wins over Oura; pace is derived, never stored; the weekly
  total counts planned logged duration plus confirmed extras, each once.

## Facts this brief rests on (verified 1 Oct 2026)

- Shared files, md5, identical in all five repos: `src/core/engine.js`
  `a1ab926a`, `program-schema.js` `e67329ea`, `cardio.js` `35e010b3`.
  `src/app.jsx` is identical in the four clients (sha256 `d2221ad3`).
- `app.jsx` does not import `cardio.js` anywhere.
- `engine.js resolveSchedule` returns `activities = skip ? [] : allActivities`
  and `isTrainingDay` counts `activities`; `buildSections` builds the
  "Extra Activity" section from `info.activities` (task id `"act-" + a.id`,
  presc "Logged activity"). That is why skip-day extras are hidden today.
  `weeklyCardioMinutes` reads `overrides[day].activities` directly, so it
  already counts them — the mismatch D1 removes.
- Coach `src/core/overview.js` (~line 482) has `hasActivity = !(info &&
  info.skip) && …` — the same hiding, on the Coach side.
- Adherence and streak already ignore skip days (`stats.js`, `adherence.js`
  filter on `skip`), so a skip day's percentage is not scored.
- `overrides[day]` syncs as the whole day payload (`sync.js`), so
  `dismissedWorkouts` and the extended `activities[]` entries need no sync
  change. Verify this claim by reading `sync.js` before relying on it.
- Number entry stores **minutes** (`parseNumberInput`: "42:30" → 42.5); a task
  with unit `"h:mm:ss"` (Ville's per-sport `<id>-dur`) displays minutes as
  h:mm:ss. Ville's run block also has `run-dur` (unit `min`) in the tracked
  items. So a duration written to `numbers[durationTaskId]` is **minutes**,
  whichever unit the task displays.
- `loadWearables` already loads `wearable_workouts` for 120 days into
  `wearables.workouts` (fields: vendor, day, sport, source, started_at,
  duration_minutes, distance_km, hr_avg, hr_max). **It does not select
  `vendor_session_id`**, but `cardio.js` (`matchDay`, `activityFromWorkout`,
  dedupe keys) uses `w.vendor_session_id`. Add it to the select, or the
  confirmed/dismissed keys will all read `polar:undefined`.
- Oura workouts carry no heart rate; an Oura-only session has duration and
  sometimes distance but no zone.
- No live programme has `hrZones`, `cardioTypes` or `block.cardio` yet (John
  fills them in Coach this week). The UI must therefore work, and be tested,
  with them absent, and with them present.

## Scope

### 1. `engine.js` — D1, all five repos, byte-identical

- `resolveSchedule`: `activities` returns `allActivities` on a skip day too.
  `slots` stay `null` on a skip day. `isTrainingDay` must be computed from
  `slots` only when `skip` is set (D1 follow-up), and as today otherwise.
  `anyMoved` unchanged.
- `buildSections`: on a skip day the notice's "cleared N sessions" counts
  scheduled slots only (extras are no longer cleared). The "Extra Activity"
  section is built on skip days too.
- Update the comment above `resolveSchedule` ("A skip clears every scheduled
  slot and every extra activity") to say what it now does.
- Copy the result into all five repos; the new md5 must match everywhere.
  Report the new md5.

### 2. Wearable matches — client UI (`app.jsx`)

- Add `vendor_session_id` to the `loadWearables` select (`wearables.js`).
- For the viewed day (Today and Calendar), compute `matchDay(date, info,
  wearables.workouts, program, overrides)`.
- **Planned match** (`planned[slot]`): shown inside that block's section as a
  suggestion — sport, duration, distance if present, HR if present — with
  Confirm and Dismiss. Confirm writes the workout's `duration_minutes` into
  `rec.numbers[block.cardio.durationTaskId]` (minutes) and the confirmation
  key into the day so it is not offered again. **It never writes an
  `activities[]` entry**, or the weekly total counts it twice. If the block
  has no `cardio.durationTaskId`, show no Confirm for it; offer it as an
  extra instead and say so in the report.
- **Extra match** (`extras[]`): shown in a "Recorded" group on that day,
  marked recorded, not planned, with Confirm and Dismiss. Confirm writes
  `activityFromWorkout(workout, program)` into `overrides[day].activities`.
- **Dismiss** appends `"<vendor>:<vendor_session_id>"` to
  `overrides[day].dismissedWorkouts`.
- Nothing is written until the client taps. Unconfirmed workouts count for
  nothing. Confirming a planned match must also be remembered so it is not
  re-offered: record the same key (decide the field with the least surprise
  — see Stop rules — do not invent a second mechanism if `dismissedWorkouts`
  can carry it; report which you chose).
- Signed-out (no `wearables.workouts`): nothing shown, no errors.

### 3. Extras on any day

Replace the free-text "Extra activity" box in the Calendar day panel with:
a type picker built from `program.cardioTypes` plus **Other** (free-text
name, as today), and optional duration (reuse `parseNumberInput` — minutes,
`m:ss`, `h:mm:ss`), distance (km), average HR, max HR. Writes the Phase 2
entry shape (`id`, `name`, `typeId`, `durationMin`, `distanceKm`, `hrAvg`,
`hrMax`, `source: "manual"`). Every entry keeps `name` (Coach reads it).
Entries may be removed, as today. When the programme has no `cardioTypes`,
the picker shows only Other and the screen behaves as it does today plus the
optional numbers. Old `{id, name}` entries still render and count 0 minutes.

### 4. Daily view shows the plan and the week

- A planned block with `block.cardio` shows its target on the daily view:
  duration, distance, zones (with bpm from `zoneBpm(zone, settings.hrMax,
  program)` when max HR is set, otherwise the zone label only), pace, note.
  Skip fields that are absent. A block without `cardio` renders exactly as
  today.
- Extras on Today show with their logged duration, distance, and avg/max
  HR or zone where known (zone from `hrAvg` against `program.hrZones` — only
  if there is an HR and a max HR; never guess one).
- One line "Cardio this week: N min" from `weeklyCardioMinutes`, using the
  programme resolver the app already uses, shown only when the programme
  defines at least one `durationTaskId`; otherwise omit it (do not show 0 or
  "—").

### 5. Version

`APP_VERSION` → `5.6.0-beta1` in each `src/core/program-<client>.js`. Rebuild
`bundle.js` and `styles.css` in each client.

### 6. Coach (small)

- Copy the new `engine.js` (byte-identical).
- `overview.js`: `hasActivity` no longer excludes skip days (D1), consistent
  with the engine.
- Bump `COACH_VERSION` and the `index.html` `?v=`; rebuild.

## Out of scope

Programme data and any Supabase write (code first, data second — John writes
zone tables and cardio targets in Coach; chat writes data after deploy).
`program-schema.js` and `cardio.js` — **do not edit**; if the logic needs a
change, stop and report. Phase 4 (`programView`). Coach notes pushed to the
app (D2). New themes. `wearable-sync` changes. Any change to HIIT/Norwegian
logging.

## Tests and gates

- Extend `test-cardio.mjs` only if it stays byte-identical across the four
  clients; put new engine behaviour in `test-history-versions.mjs` or a new
  identical test file.
- New checks, at least: skip day with extras → `activities` returned, slots
  null, `isTrainingDay` false; same day without skip unchanged; weekly total
  still counts a skip-day extra exactly once; a confirmed planned match
  writes minutes to the declared task and adds no activity; extras confirm
  writes an activity and is not re-offered; dismissed not re-offered;
  `vendor_session_id` present in the loaded rows; legacy `{id,name}` entry
  counts 0.
- Every existing gate must still end `0 failed`: per client
  `verify-program-delivery.mjs`, `test-history-versions.mjs`,
  `test-wearable-scope.mjs`, `test-cardio.mjs`, `npm run build`; Coach all
  `verify-*.mjs` and `npm run build`. Never pin a pass count.
- **Browser check** (the session cannot sign in): headless Chromium against a
  built client with fixture data — Today with a planned match, Today with a
  recorded extra, a skip day with an extra, the Calendar extras form with
  and without `cardioTypes`. Screenshots in
  `briefs/reports/step9-phase5-cardio-client/`. Wait ≥ 4 s for charts.
- Byte-identical: `engine.js` across all five (new md5); `program-schema.js`
  `e67329ea` and `cardio.js` `35e010b3` unchanged; `app.jsx`, `wearables.js`
  identical across the four clients.

## Stop rules (beyond the README)

- `cardio.js` or `program-schema.js` needs a change → stop, report.
- A planned block has `durationTaskId` pointing at a task that is not a
  number task → stop, report.
- Where to record a confirmed planned match is unclear (item 2) → stop and
  ask; do not add a third mechanism.
- The code differs from the facts above → the code wins; stop and report.

## Done means

One PR per repo (five), no merge. Report
`briefs/reports/step9-phase5-cardio-client-report.md` pushed with the Coach
PR: result, changes per repo, last gate lines, hashes, open items. Chat then
verifies every branch (gates, rebuild check, live-data run) before John
merges in order Henna → Joonatan → Ville → Juha → Coach.
