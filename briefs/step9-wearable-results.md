# Brief — Wearable results, one tick per session, notes visible (Step 9 follow-up)

Drafted and approved 11 Oct 2026 in chat. Status: **ready to run**.
Repos: Henna, Joonatan, Ville, Juha (client `app.jsx` + shared `engine.js`,
`cardio.js`, `program-schema.js`), Coach (shared files + validator + fixture).
Takes the shared `app.jsx` lock.

## 1. Findings that motivate this (verified 11 Oct 2026)

| # | What the user saw | Cause (file / data) |
|---|---|---|
| F1 | Today's Oura strength session not in the app | Not in `wearable_workouts` yet. Cron `wearable-nightly-sync` runs `0 6,15 * * *` UTC (09:00/18:00 Helsinki); client syncs once per app launch (`wearSyncedRef`, app.jsx ~L407). |
| F2 | Strength sessions disappear after OK | `NonCardioOffers` → `onAck` → `dismissWorkout`: OK adds the id to `dismissedWorkouts`; nothing (duration, HR) is kept. Seen 2 Oct (`oura:9d9292c9…`). |
| F3 | Exercise note not visible after saving | `commitExNote` saves `rec.exNotes[id]`, but `lastExNotes` (app.jsx ~L1047) only reads days `< viewedKey`. Today's note shows only as the "Edit note" label. |
| F4 | Ville's long run: two ticks for one run; distance/HR rows empty | `confirmPlannedWorkout` writes only `numbers[durationTaskId]`. Polar row had 15.34 km / avg 116 / max 158. Each `type:"number"` task counts as its own done item (`isTaskDone`, `countableTasks`). "From Polar" is programme text only. |

Database checks: Ville's weekly total 711 min = 41.9 + 65.2 + 190 + 165 + 48.8 + 68.5 + 131.3 — no double count. Oura/Polar duplicates are already merged by `dedupe()` (Polar wins).

## 2. Owner decisions (11 Oct 2026)

- **D12:** a session matched from a wearable shows as **one tick**, not one per result field.
- **D13:** confirming a wearable session fills **distance, average HR and max HR** as well as duration.
- **D14:** **average and max HR are kept for every exercise that comes from a wearable** (Oura, Polar, any later vendor) — cardio, strength, yoga, extras.
- **D15 (confirmed 11 Oct):** on a planned strength/yoga day, **OK records the watch session's duration, average HR and max HR onto the workout block being filled in the app** (e.g. Strength C), instead of discarding it. Supersedes the "OK only acknowledges" part of D4; strength/yoga stay non-cardio and the OK adds no tick.
- **D16:** past days are **re-scored** under the new counting (no cut-over date).
- **D17:** typing a duration by hand (no watch) also **ticks the session task**.
- **D18:** A (today's note visible) and B (re-sync on return) are **in scope**.

## 3. Changes

### A — Show today's exercise note (app.jsx)
Under each strength exercise show today's `rec.exNotes[id]` ("📌 Today: …") in addition to the previous session's note. Keep "Edit note".

### B — Re-sync wearables on return to the app (app.jsx)
On `visibilitychange` → visible, if the last sync was > 10 min ago, call `syncVendor` for connected vendors and reload. Keep the once-per-launch sync.

### C — Record strength/yoga sessions on the planned block (D15, app.jsx + cardio.js)
OK writes an `activities[]` entry via `activityFromWorkout` (already tags `kind: "strength"|"yoga"`, carries `durationMin`, `hrAvg`, `hrMax`) plus `slot` and `block` (the block being filled, e.g. `strength`/`c`). It renders **inside that block's card** as a session line ("Session · 1:21 · avg 118 · max 152 · Oura"), in Today, Train and Calendar, and Coach shows it on the day card. Not an extra; non-cardio (`isCardioActivity` already excludes it); adds **no** tick and does not touch exercise ticks. No programme data change is needed for strength blocks.

### D — Result fields from the wearable (D13, D14; schema + app.jsx)
1. `program-schema.js`: block `cardio` may declare, besides `durationTaskId`, optional `distanceTaskId`, `hrAvgTaskId`, `hrMaxTaskId`. Validator: each must name a `type:"number"` task in the same block (error), as for `durationTaskId`.
2. `confirmPlannedWorkout`: write every declared field the workout has (`duration_minutes`, `distance_km`, `hr_avg`, `hr_max`). A value the client already typed is kept (current rule for duration, extended to all four).
3. Extras: already store `distanceKm`, `hrAvg`, `hrMax` — show HR in the extra's card everywhere it is listed (Today, Calendar, Coach).

### E — One tick per session (D12; engine.js — shared, all 5 repos)
- Tasks named by a block's `cardio.*TaskId` are **result fields**: shown and editable, but **not counted** in `countableTasks` (same as `notes`).
- The block's session task (the first non-number task, e.g. `run-long`) is the one countable item. It is ticked when a wearable session is confirmed into the block, **or** when the client types a duration (D17). Un-ticking stays manual.
- Coach adherence uses the same `isTaskDone`/`countableTasks` path — no separate logic.

## 4. Data changes (after code merges; generated `.sql`, guarded, John runs in SQL Editor)

Add the new `cardio.*TaskId` keys where the tasks exist (verified 11 Oct), as a new forward-dated version per client (one version per effective date):
- **Ville** (`ville-2026-10-08` is current): run `easy`/`long` → `distanceTaskId: run-dist`, `hrAvgTaskId: run-hr-avg`, `hrMaxTaskId: run-hr-max`; bike `easy`/`tempo` → `bike-dist`, `bike-hr-avg`, `bike-hr-max`. `durationTaskId` already set.
- **Juha — regression found and fixed 11 Oct:** `juha-2026-10-09` had lost the four `durationTaskId` links and duration tasks from item A (cardio `hard`/`zone2`, tennis `lesson`/`social`); verified those four blocks were the only loss. Fixed by `juha-2026-10-12` (effective 12 Oct) = 10-09 + those four blocks from 10-08 — SQL `juha-2026-10-12-restore-cardio.sql`, expected fp `1abccbde`. 9–11 Oct stay scored under 10-09 (forward-only). For this brief: add `hrAvgTaskId: cv-hr-avg`, `hrMaxTaskId: cv-hr-peak` to `hard`, `zone2`, `lesson`, `social` in Juha's next version (item H, 26 Oct) — after this code ships.
- Side note (not fixed): in 10-09, `up-1` and `lo-2` in Strength B have `sets: 4` but `presc` still says "3×8–12".
- **Henna, Joonatan:** no planned cardio slots — nothing to add.

Generated `.sql`, guarded on the expected current fingerprint; John runs it; chat verifies by fingerprint.

## 5. Verification (chat, before merge)
- Unit tests: confirm writes all four fields; typed values kept; result fields excluded from the count; session task ticked once; strength OK writes a non-cardio activity and 0 cardio minutes; `weeklyCardioMinutes` unchanged for Ville's 5–11 Oct week (= 710.7).
- Validator new rules vs all live versions.
- Hashes: shared files identical across repos; rebuild byte-identical.
- Merge order Henna → Joonatan → Ville → Juha → Coach.

## 6. Status of questions
- Answered 11 Oct: history re-scored (D16), manual duration ticks the session (D17), A + B in scope (D18).
- D15 confirmed 11 Oct. Nothing open.
