# Brief — Step 10 Phase 1: wearable small items

Drafted and approved 26 Oct 2026 in chat. Status: **ready to run**.
Repos: **Henna, Joonatan, Ville, Juha, Coach** (all five).
**Takes the shared `app.jsx` lock** (verified free 26 Oct: no client branch is
ahead of `main`).

Starting point, verified 26 Oct 2026 on fresh clones:

| Repo | `main` | Version |
|---|---|---|
| Henna | `b5f78d2` | 5.9.1-beta1 |
| Joonatan | `949a693` | 5.9.1-beta1 |
| Ville | `79e1391` | 5.9.1-beta1 |
| Juha | `edb19df` | 5.9.1-beta1 |
| Coach | this brief's commit | 0.12.2 |

Shared md5 at the start: `program-schema.js` `45f9bf18` (5), `cardio.js`
`6c67a07e` (5), `engine.js` `ea50d30f` (4 clients) / `29523890` (Coach),
`categories.jsx` `5cd5a31a` (4), `wearables.js` `0378af25` (4); `app.jsx`
sha256 `f927ced9…` (4).

---

## 1. Already done in chat — do not redo, do not touch

- **`wearable-sync` v8 deployed** (26 Oct): Polar sport ids 9 → `nordicWalking`,
  11 → `walking`, 24 → `crossCountrySkiing`. Verified: one cron-style run, all
  5 connections HTTP 200, no errors.
- **Function sources committed** with this brief under `supabase/functions/`
  (sync v8, connect, callback, cron with its key redacted, README). **Leave
  that folder exactly as it is.** Cloud sessions never deploy.
- `briefs/data/step10-phase1/polar-sport-relabel.sql` — John runs it; not you.

## 2. Decisions in force (John)

- **D10 (6 Oct)** Ski is a **standard slot** with blocks XC-Classic, XC-Skate,
  Downhill, logged like runs: distance, duration (h:mm:ss), average HR, max HR.
- **D10a (26 Oct)** **Downhill counts** toward weekly cardio, like XC — all
  three Ski blocks behave the same.
- **D11 (7 Oct)** A daily task can carry `auto: { source: "steps", min: N }`.
  It shows that day's Oura steps beside its target text and ticks itself at
  ≥ N; the tick is **written into the day log** so Coach adherence needs no new
  logic. Manual tick and un-tick stay possible. Oura only (Polar sends no day
  rows). Oura's activity day runs 04:00–04:00 local and is labelled with that
  date.
- **D11a (26 Oct)** Henna's threshold is **7,000** (her task gets renamed in
  data, §6). Juha's is 10,000.
- Sport codes come **only from observed sessions**, never from documentation.
  No downhill session has been seen, so Downhill has **no sport code** yet.

## 3. Scope

### A — Housekeeping

**A1. Coach `engine.js` back in line.** Copy the client `src/core/engine.js`
(md5 `ea50d30f`) over Coach's (`29523890`). Verified 26 Oct: the client file
is a superset — it adds `groupLoadKeysByName` and makes the strength-load series
accept one key or an array of keys; a single key behaves as before. Chat ran
every Coach gate with the client file in place on 26 Oct: all pass. Do this
first; C2 then edits the one shared file.

**A2. Fix the `verify-wearables.mjs` time bomb (4 clients).** On today's `main`
it ends `17 passed, 2 failed` in every client ("only real sessions counted",
"session minutes exclude housework"). Cause: `buildRecovery` in
`src/core/wearables.js` takes its 30-day cutoff from `new Date()`, and the
test's fixture is dated 23 Sep 2026, so the checks expired around 24 Oct. Not
an app defect.
- Add an optional last parameter: `buildRecovery(days, workouts, subjectId = null, now = new Date())`,
  used only for the cutoff. Existing callers do not change.
- `verify-wearables.mjs` passes a fixed `now` (`2026-09-24T12:00:00`).
- `wearables.js` stays byte-identical across the 4 clients.

### B — Ski standard slot (D10, D10a)

**B1. Catalogue (`program-schema.js`, shared, all 5).**
- Add, after `cardio`:
  `{ id: "ski", label: "Ski", color: "#B5DDF2", countsAsCardio: true, sports: ["crossCountrySkiing"], blocks: SKI_BLOCKS }`.
  Colour chosen 26 Oct: nearest existing slot/category colour is Cardio
  `#4CB6C4` at CIE76 ΔE 24.7 (≥ 20, the Phase 6 rule); contrast 13:1 against
  the dark text. Re-check it the way Phase 6 did and report the number.
- Add `"crossCountrySkiing"` and `"nordicWalking"` to `KNOWN_SPORTS` (both
  observed in `wearable_workouts`, 10–14 Oct).
- Update the catalogue comment ("The seven slots…" → eight; dated 26 Oct).
- `blocks` is a new, **optional** catalogue field: block templates written into
  a programme when the slot is added. Only Ski has one now.

**B2. The Ski block template (`SKI_BLOCKS`, in `program-schema.js`).** Mirror
the shape of Ville's live run blocks (`ville-2026-10-12`, `run.long`): session
task first, then the result fields.

| Block key | `label` | session task id | session `name` |
|---|---|---|---|
| `xc-classic` | XC-Classic | `ski-classic` | Classic skiing |
| `xc-skate` | XC-Skate | `ski-skate` | Skate skiing |
| `downhill` | Downhill | `ski-downhill` | Downhill skiing |

Each block:
- `cat: "ski"`, `exercises`:
  1. the session task (`sets: null`, `presc: ""`);
  2. `ski-dist` · "Distance" · `type: "number"`, `unit: "km"`, `presc: "From your watch"`;
  3. `ski-dur` · "Duration" · `type: "number"`, `unit: "h:mm:ss"`, `presc: "From your watch · h:mm:ss or mm:ss"`;
  4. `ski-hr-avg` · "Average heart rate" · `type: "number"`, `unit: "bpm"`, `presc: "From your watch"`;
  5. `ski-hr-max` · "Max heart rate" · `type: "number"`, `unit: "bpm"`, `presc: "From your watch"`.
- `cardio: { durationTaskId: "ski-dur", distanceTaskId: "ski-dist", hrAvgTaskId: "ski-hr-avg", hrMaxTaskId: "ski-hr-max" }`.
  **No** targets (`durationMin`, zones, `note`): the coach sets those per
  client. The result ids are shared across the three blocks, as Ville's
  `run-dur` is.

**B3. Coach editor (`src/core/editor.js`).**
- `addStandardSlot(def, id)`: when the catalogue entry has `blocks`, write
  them into `blocks[id]` and add one `slotOptions[id]` entry per block
  (`{ label, value: key }`) after `None`. A slot without a template behaves
  exactly as today (empty).
- If any template task id already exists anywhere in the programme, **throw**
  with a message naming the id — ids are permanent and never reused.
- "Use standard cardio types" already loops over `STANDARD_SLOTS`, so it will
  offer a Ski type (`sports: ["crossCountrySkiing"]`, linked to the slot when
  present). Confirm by test; no code change expected.

**B4. Client icon (`src/core/categories.jsx`, 4 clients, byte-identical).** Add
`ski: MountainSnow` to `ICONS` (lucide-react 1.35.0 ships it — verified).

### C — Steps auto-tick (D11, D11a) — the `app.jsx` part

**C1. Schema (`program-schema.js`).** A task in `daily` (in `tasks` or a
`byDayType` variant) may carry `auto: { source: "steps", min: N }`. Errors:
- `source` is not `"steps"`;
- `min` is not an integer ≥ 1;
- the task has a `type` (only plain check tasks can auto-tick);
- `auto` on a block exercise ("auto is only for daily tasks").
Run the new rules against **every** programme in Coach
`fixtures/programs.json` (11 versions, older than live — a known cleanup
item); none may gain an error. Chat re-runs them against every live version
before merge.

**C2. Pure logic (`engine.js`, shared, all 5).**
`stepsAutoTicks(sections, rec, steps)` → the task ids to tick: every task in
`sections` with `auto.source === "steps"` where `steps` is a finite number,
`steps >= auto.min`, and **`rec?.done?.[task.id] === undefined`**. The last
rule is what keeps a manual un-tick (`toggleTask` writes `false`) from being
re-ticked — the same "transition only" idea as the strength auto-tick. It
never writes `false` and never touches a `true`.

**C3. Client (`app.jsx`, all 4, byte-identical).**
- **Which steps:** the signed-in user's own `oura` row in `wearables.days`
  with `day === dateKey(d)` (`user_id === authUser.id`). Not `collapseDays`.
  No row, or `steps == null`, means unknown — never 0.
- **When:** an effect over today and the 6 days before, re-run when
  `wearables.days` or the log changes. For each day: `buildSections` for that
  date with **that day's programme** (`programForDate`), then
  `stepsAutoTicks`; write through `setLog` + `store.saveJSON("log", …)` +
  `queueLogDay(key, …)`, as `confirmPlannedWorkout` does.
- **HARD REQUIREMENT — only after the first successful `pullAndMerge`.**
  `pullAndMerge` lets a pending local day win over the cloud copy. On a fresh
  device the local log is empty; an auto-tick queued before the merge would
  replace the client's real cloud day with a one-tick record. Gate the effect
  on a flag set only when `pullAndMerge` resolves non-null. If the pull fails
  or the user is signed out, no auto-tick runs this session.
- Because `auto` lives on a programme version and each day resolves to the
  version in force that day, days before the version carrying `auto` are never
  touched. No backfill logic is needed.
- **Display:** for a task with `auto`, the line under the name reads the task's
  `presc`, then ` · 8,412 / 10,000 steps` (thousands separator, as Oura shows
  it). If the client has an Oura connection but no number yet for that day:
  ` · steps not synced yet`. With no Oura connection, `presc` alone, unchanged.
  The checkbox stays tappable.
- **Coach:** nothing new. The tick is in `day_logs.payload.done`, which
  adherence already reads.

### D — Versions

- Clients: `APP_VERSION` `5.10.0-beta1` (all 4, `program-<client>.js`).
- Coach: `COACH_VERSION` `0.13.0`.

## 4. Out of scope

- Any Supabase change (cloud sessions never touch it). Anything in
  `supabase/functions/`.
- Programme data: the `auto` fields, Henna's task rename and any Ski slot in a
  client programme are §6, after merge.
- A downhill sport code, a Ski type in any live programme, adding
  `nordicWalking` to the Walk slot's sports (see §8).
- The cleanup list in `next-phase-handoff.md` §4.

## 5. Gates

In every repo, from a fresh `npm install`:
- every `test-*.mjs` and `verify*.mjs` ends `0 failed` / `ALL CHECKS PASSED`
  (Coach `verify-render.mjs` is run bundled, as its header says);
- `verify-wearables.mjs` now ends `0 failed` in all 4 clients (A2);
- `npm run build` succeeds; a second build is byte-identical to the first.

`verify-otp.mjs` is browser-timed and failed once in Henna on 26 Oct, then
passed on a rerun. One rerun is allowed for it; report if it fails twice.

**New tests (put each next to the closest existing test file):**
1. `stepsAutoTicks`: ticks at = min and above; not below; not when steps is
   null/undefined; not when `done[id]` is `false` (manual un-tick) or `true`;
   ignores tasks without `auto`; honours `byDayType` and `dayOfWeek` via
   `buildSections`.
2. Merge gate: with the flag unset, no tick is written and nothing is queued;
   after a successful merge, the tick lands on top of the merged day (the
   day's other fields survive).
3. Version boundary: a day resolved to a version without `auto` is never
   ticked, even with 20,000 steps.
4. Validator: each C1 error fires; every fixture programme stays error-free.
5. Ski: `addStandardSlot(def, "ski")` on every fixture programme validates
   with 0 errors and yields 3 blocks + 3 slot options; it throws on a
   colliding task id; `weeklyCardioMinutes` counts a logged `ski-dur` on each
   of the three blocks (D10a); `resultWritesFromWorkout` fills all four
   fields from a `crossCountrySkiing` workout; "Use standard cardio types"
   adds a Ski type.
6. `buildRecovery` with a fixed `now` (A2).

**Browser check** (headless Chromium, screenshots to
`briefs/reports/step10-phase1/`):
- Client (Juha build, a fixture programme with `auto` on `chk-walk`): the steps
  line at 8,412 (unticked) and at 10,250 (ticked); "steps not synced yet";
  a manual un-tick that stays un-ticked after a re-render.
- Coach: add Ski to a Ville fixture; the three blocks show; Check passes.

**Byte-identical, report hashes:** `app.jsx`, `categories.jsx`,
`wearables.js` across the 4 clients; `program-schema.js`, `cardio.js`,
`engine.js` across **all 5**.

## 6. Data changes — after merge (chat generates, John runs; not this session)

Forward-dated versions, built from the version in force, one per effective
date:
- **Juha** (from `juha-2026-10-12`): `chk-walk` gains `auto: { source: "steps", min: 10000 }`. Nothing else
  changes (item H comes later and builds from this one).
- **Henna** (from `henna-2026-10-07`): `steps` gains `auto: { source: "steps", min: 7000 }` and is
  renamed "Walk 7,000 steps".
- Guarded `.sql`, fingerprint-verified after.

## 7. Stop rules (beyond the README)

- The merge gate (C3) cannot be made testable without restructuring the sync
  start-up → stop and report; do not ship the auto-tick ungated.
- A fixture programme fails validation after B1/C1 → stop and report which
  rule and which programme.
- `MountainSnow` missing from the installed lucide-react → stop (do not pick
  another icon).

## 8. Open, for John (not for this session)

- **Classic or skate?** Ville's four `crossCountrySkiing` sessions (10–14 Oct,
  10–13 km in ~45 min, October) look like roller-skiing; the technique is not
  in the data. Polar may use one sport id per technique — confirm with Ville.
- **Nordic walking:** `nordicWalking` is not in the Walk slot's sports, so it
  arrives as an extra labelled "Nordic Walking" and counts as cardio. The
  30-minute rule for auto-detected walks applies only to `walking`. Decide
  whether Nordic walking belongs to Walk.
- Ville's 7 already-confirmed sessions keep the labels his app stored
  ("Polar:24", "Polar:11", "Polar:9"); minutes are correct.
