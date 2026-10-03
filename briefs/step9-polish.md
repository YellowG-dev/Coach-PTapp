# Step 9 · Polish — closing items G (handoff §4)

Status: **READY once `briefs/data/polish/programs-new-rows.json` is committed** (§4 depends on it; everything else can run without it). Written 3 Oct
2026 from live `main` (clients 5.8.0-beta1, Coach 0.12.0). Re-check every fact
below against `main` before editing.
Branch: the session's own (see README).
Versions: clients → **`5.8.1-beta1`**; Coach → **`0.12.1`**, with the
`index.html` `?v=` cache-bust.

## Why

Small faults found after Phase 5/6 went live, plus two pieces of coach-side
housekeeping. None changes how anything is scored. All of it closes Step 9
before Step 10 starts.

## Decisions

| # | Topic | Decision | John |
|---|---|---|---|
| P1 | "Rearranged" badge | Shows only when a planned slot was moved or cleared, or the day is a skip day. Extras (manual or from the watch) never trigger it. Same rule for the Calendar's dashed day border. | Approved 3 Oct |
| P2 | Extra Activity subtitle | By source: all manual → "Added from Calendar" (unchanged); all from the watch → "From your watch"; mixed → "From Calendar and your watch". | Approved 3 Oct |
| P3 | `durationTaskId` rule | **Error** (blocks publishing): the client app already ignores a target whose task is not `type: "number"`, so a wrong one fails silently today. | Approved 3 Oct |
| P4 | Delete a not-yet-effective version | Coach gets "Delete version" for rows with `effective_from` > today only, with a confirm. The database delete policy is tightened to match (SQL John runs after merge; see §5). | Approved 3 Oct |

Earlier decisions still hold, in particular D1 (skip-day extras count, a skip
day is not a training day) and "past days are scored against the version in
force on that date".

## Facts (verified 3 Oct 2026)

### Shared files (unchanged by Phase 6 merge)

`engine.js` `c3eb98c2` (all 5) · `program-schema.js` `69fc9ea5` (all 5) ·
`cardio.js` `37723a00` (all 5) · `app.jsx` sha256 `64101b07…` (4 clients).

### Item 1 — "Added from Calendar" on a watch workout

- `engine.js` `buildSections` (~line 315) pushes one section `key: "activity"`
  with the fixed `subtitle: "Added from Calendar"` for every entry in
  `info.activities`.
- Manual extras are written only from the Calendar (`addActivity`,
  `app.jsx` ~line 789, called ~line 2395) with `source: "manual"`.
- Confirmed watch workouts come from `activityFromWorkout` (`cardio.js`
  ~line 244) with `source: "wearable"`.
- `app.jsx` renders `section.subtitle` at ~lines 1634 and 1674.

### Item 2 — "Rearranged" badge

- `engine.js` `resolveSchedule` (~line 107):
  `anyMoved = any(moved) || allActivities.length > 0 || Boolean(skip)`.
  So any extra, including a confirmed watch workout, sets it.
- `info.moved` (per slot) and `info.skip` are already returned.
- `anyMoved` is read in two places only, both in `app.jsx`: the Today badge
  (~line 1493) and the Calendar day border (~line 2495). Coach does not read
  it (`grep` 3 Oct).

### Item 3 — `durationTaskId` validator

- `program-schema.js` `validateBlockCardio` (~line 359) checks only that the
  id names a task in the same block's `exercises`.
- `app.jsx` ~line 231 offers a planned match only when that task has
  `type === "number"`.
- Live data: **no** live version has `block.cardio` or `cardioTypes` (all 11
  rows, 3 Oct), so a new error rule cannot fail a live version.

### Item 4 — Coach "unplanned session" flag

- `coach-ptapp/src/core/overview.js` ~lines 481–491, `matches(w)`:
  strength is matched to a planned strength slot; any other sport without a
  cardio type falls through to `anyNonStrength || hasActivity`.
- Effect today: a yoga workout on a strength-only day is flagged
  (correct); a yoga workout on a day with **any** non-strength slot
  (e.g. a run) is **not** flagged, even when no yoga is planned (wrong).
- `cardio.js` already exports `nonCardioSlotFor(sport)` (~line 54).

### Item 5 — `fixtures/programs.json`

- Holds 5 rows: `juha-2026-09`, `juha-2026-09-23`, `henna-2026-09`,
  `joonatan-2026-09`, `ville-2026-09`. All 5 are **identical to live**
  (definition md5 in Postgres `jsonb::text` form matches, 3 Oct).
- Live has 6 more rows not in the fixture:

  | id | effective_from | definition md5 (`jsonb::text`) |
  |---|---|---|
  | `henna-2026-10` | 2026-10-02 | `eab61a5b6e8e0ed95025aed336e1735d` |
  | `joonatan-2026-09-29` | 2026-09-29 | `23d924faa27ae244acc7a9ff9ba0ef01` |
  | `joonatan-2026-10` | 2026-10-02 | `5439607e02902de944c3523c95a99005` |
  | `juha-2026-09-29` | 2026-09-29 | `59375a3b6927b117909711cc393443ef` |
  | `juha-2026-10` | 2026-10-01 | `b3ae2519780779ff6b5ff8b6177da6a0` |
  | `ville-2026-10` | 2026-10-02 | `fafa7cdb81bb92ac66b899ba00636504` |

- The 6 rows will be at `briefs/data/polish/programs-new-rows.json`,
  exported from live by John and checked against the md5s above by chat
  before the session starts.
- Fixture readers: `verify-adherence`, `verify-browser`, `verify-editor`,
  `verify-overview`, `verify-progress`, `verify-publish`, `verify-validator`.
  Their fixed "today" dates are 18–28 Sep and the fixture logs end 20 Sep, so
  rows effective 29 Sep or later should not change any existing result.

### Item 6 — deleting a version

- Coach writes programmes only with `insert` (`src/core/data.js` ~line 188).
  Nothing deletes.
- Live RLS on `programs` (3 Oct): `programs_delete` is
  `owner_id = auth.uid()`, **with no date guard** — the owner could delete an
  in-force or past version, which would re-score history.

## Scope

### 1. Client app display — `app.jsx` (four clients, byte-identical)

Per P1 and P2. **`engine.js` stays `c3eb98c2`.**

- Add two small pure helpers in `cardio.js` (it already owns extras), so the
  client tests can import them:
  - `plannedChanged(info)` → `Object.values(info.moved || {}).some(Boolean) || Boolean(info.skip)`;
  - `extrasSubtitle(activities)` → the P2 wording by `source`
    (`"wearable"` vs anything else, which covers `"manual"` and legacy
    entries without `source`).
- Today badge (~1493) and Calendar border (~2495) use `plannedChanged(...)`
  instead of `anyMoved`.
- Where a section with `key === "activity"` renders its subtitle, use
  `extrasSubtitle(info.activities)`.

### 2. Validator — `program-schema.js` (all five repos, byte-identical)

Per P3: in `validateBlockCardio`, when the named task exists but its `type`
is not `"number"`, raise an **error**:
`<at>.durationTaskId "<id>" must name a task with type "number" (got "<type>")`.
A task without `type` counts as `"exercise"` (as `mapTask` does).

### 3. Coach overview — `src/core/overview.js`

In `matches(w)`, before the cardio-type lookup:
`const nc = nonCardioSlotFor(w.sport); if (nc) return planned(nc);`
This replaces the strength-only line. Unknown sports keep the existing
no-false-alarm fallback.

### 4. Fixture refresh — `fixtures/programs.json`

- Append the 6 rows from `briefs/data/polish/programs-new-rows.json`
  unchanged. Do not touch the existing 5 rows or their order.
- `verify-validator.mjs` gains: every row in `fixtures/programs.json`
  validates with **0 errors** under the new `program-schema.js`. (This is
  the "new rules vs all live versions" check, runnable in the session.)
- If any existing gate's numbers change because of the new rows → **stop
  and report**; do not edit expectations.

### 5. Coach — delete a not-yet-effective version (P4)

- `src/core/data.js`: `deleteFutureVersion(id)` — deletes by `id` and adds
  `.gt("effective_from", <today as yyyy-mm-dd>)` to the query, so the client
  side refuses an in-force or past row even before the database does.
- Editor UI: a "Delete version" action shown only on a version whose
  `effective_from` is after today, with a confirm naming the id and date.
  After delete, reload the version list.
- Write `briefs/data/polish/programs-delete-policy.sql` (not run by the
  session) that replaces `programs_delete` with
  `owner_id = auth.uid() AND effective_from > current_date`, guarded so it
  only applies when the current policy text is exactly
  `(owner_id = auth.uid())`, and ending with a `select` from `pg_policies`
  that shows the result.

### 6. Version and build

Clients: `APP_VERSION` → `5.8.1-beta1` in each `src/core/program-<client>.js`.
Coach: `COACH_VERSION` → `0.12.1`, `?v=` → `0.12.1`. `npm run build` in all
five repos. Copy `program-schema.js` and `cardio.js` byte-identical to Coach.

## Out of scope

- `engine.js` (must stay `c3eb98c2`).
- Removing the hand-written `ProgramView` / `phase4/program-view.before.jsx`
  (handoff §4 "later cleanup": the data tabs have run since 2 Oct only).
- Any Supabase read or write. The policy SQL is a file for John.
- Changing what counts as cardio, adherence scoring, or any colour.

## Tests and gates

### `test-cardio.mjs` (four clients, identical) gains at least

- `plannedChanged`: a moved slot → true; a skip day → true; only manual
  extras → false; only a confirmed watch extra → false; nothing → false.
- `extrasSubtitle`: all manual, all wearable, mixed, legacy entry without
  `source` (→ manual wording).
- Validator: `durationTaskId` naming a `number` task → no error; naming an
  `exercise` task or a task without `type` → the new error; naming a missing
  task → the existing error.

### `test-cardio-client.mjs` gains at least

- A day with a confirmed watch extra and no slot change: `plannedChanged`
  false; the activity section uses "From your watch".

### Coach

- `verify-overview.mjs`: yoga workout on a day with a planned run and no
  yoga → flagged; yoga on a planned yoga day → not flagged; strength
  behaviour unchanged; an unknown sport keeps the no-false-alarm fallback.
- `verify-validator.mjs`: the all-fixture-rows check above.
- `verify-editor.mjs` or a new `verify-delete.mjs`: `deleteFutureVersion`
  builds a query with the `effective_from` guard; the UI helper that decides
  whether to show "Delete version" is false for today and past dates, true
  for tomorrow.

### Gates

Every existing gate in every repo ends `0 failed`, plus `npm run build`.

### Browser check

Headless Chromium, saved to `briefs/reports/step9-polish/`:
- **Client (Henna build):** confirm a watch workout on a day with no slot
  change → no "Rearranged" badge, subtitle "From your watch", Calendar
  border solid; move a slot on another day → badge and dashed border.
- **Coach:** with a mocked future version, "Delete version" is offered and
  sends the guarded delete; on the in-force version it is not offered.

### Byte-identical

`app.jsx`, `test-cardio.mjs`, `test-cardio-client.mjs` across the four
clients; `program-schema.js`, `cardio.js`, `engine.js` across all five. Report
the new hashes (and `engine.js` unchanged at `c3eb98c2`).

## Stop rules (beyond the README)

- `engine.js` would need a change → stop and report.
- Any existing gate's result changes after the fixture append → stop.
- `briefs/data/polish/programs-new-rows.json` is missing or not 6 rows →
  skip §4 only, finish the rest, report it.
- A live-version check would fail the new validator rule → stop and report.

## Done means

- One PR per repo (five), not merged.
- Report at `briefs/reports/step9-polish-report.md`: result, changes, gates,
  hashes, open items.

Chat verifies every branch before John merges, in the order Henna →
Joonatan → Ville → Juha → Coach. John then runs
`programs-delete-policy.sql` in the SQL Editor; chat verifies the policy.
