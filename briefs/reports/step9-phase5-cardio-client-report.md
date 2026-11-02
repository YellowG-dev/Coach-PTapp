# Report — step9-phase5-cardio-client

## Result

Done. All five repos changed, all gates end `0 failed`, browser check 27 passed / 0 failed. One PR per repo, not merged. Two judgement calls John should look at: the "Keep mine" rule and where a confirmed planned match is remembered (both under **Open**).

## Changes

Clients (Henna, Joonatan, Ville, Juha) — identical except `program-<client>.js`:

- `src/core/engine.js` — D1. `resolveSchedule` returns `activities = allActivities` on a skip day; `slots` stay `null`; `isTrainingDay` is computed from slots only when `skip` is set. `buildSections` builds "Extra Activity" on skip days; the skip notice counts scheduled slots only. Comment above `resolveSchedule` rewritten.
- `src/core/wearables.js` — `vendor_session_id` added to the `wearable_workouts` select.
- `src/app.jsx` — item 2, 3, 4 (see below).
- `src/core/program-<client>.js` — `APP_VERSION` `5.5.3-beta1` → `5.6.0-beta1`.
- `bundle.js`, `styles.css` — rebuilt with `npm run build` (`styles.css` came out byte-identical).
- `test-cardio-client.mjs` — new, identical across the four. 18 checks: skip-day extras, `isTrainingDay`, weekly total counts a skip-day extra once, legacy `{id,name}` counts 0, planned confirm writes minutes and no activity, extra confirm writes one activity, dismissed / confirmed not re-offered, `vendor_session_id` present in the select.

`app.jsx` summary:

- Today and Calendar: `matchDay` for the viewed day. A planned match is shown inside its block's card with Confirm / Dismiss; other matches go in a "Recorded" group marked *recorded, not planned*. Nothing is written until a tap.
- Confirm (planned) writes `duration_minutes` to `log[day].numbers[block.cardio.durationTaskId]` and never an `activities[]` entry. Confirm (extra) writes `activityFromWorkout(...)`. Dismiss appends `"<vendor>:<vendor_session_id>"` to `overrides[day].dismissedWorkouts`.
- Calendar "Extra activity": type picker (`cardioTypes` + Other), optional duration (`parseNumberInput`), distance, avg / max HR. Writes the Phase 2 entry shape, `source: "manual"`, always with `name`. Remove still works. Old `{id,name}` entries still render.
- Today: planned block with `block.cardio` shows its target (duration, distance, zones with bpm when max HR is set, pace, note; absent fields skipped). Extras show logged duration / distance / avg+max HR, and a zone only when avg HR and max HR both exist. One line "Cardio this week: N min", shown only when a programme in that week defines a `durationTaskId`.
- Removed the now-unused `activityDraft` state.

Coach:

- `src/core/engine.js` — byte-identical copy.
- `src/core/overview.js` — `hasActivity` no longer excludes skip days.
- `verify-overview.mjs` — one assertion encoded the old behaviour ("workout on a skip day → flag" with a logged extra). Changed to "no flag" and added "skip day with no extra → flag". Needed so the gate matches D1; flagging it as a deliberate edit.
- `COACH_VERSION` `0.10.1` → `0.11.0`, `index.html` `?v=` → `0.11.0`, `bundle.js` rebuilt.
- `briefs/reports/step9-phase5-cardio-client/` — screenshots, `browser-check.mjs`, `browser-check-output.txt`.

## Gates

Per client (Henna, Joonatan, Ville, Juha all identical):

- `verify-program-delivery.mjs` — `95 passed, 0 failed`
- `test-history-versions.mjs` — `29 passed, 0 failed`
- `test-wearable-scope.mjs` — `10 passed, 0 failed`
- `test-cardio.mjs` — `63 passed, 0 failed`
- `test-cardio-client.mjs` — `18 passed, 0 failed`
- `npm run build` — `Done in <1s`, exit 0

Coach:

- `verify-adherence` 36/36 · `verify-browser` All browser checks passed · `verify-editor` 46 passed, 0 failed · `verify-overview` 79 passed, 0 failed · `verify-progress` 40 passed, 0 failed · `verify-publish` 31/31 · `verify-recovery` 12 passed, 0 failed · `verify-validator` ALL CHECKS PASSED · `verify` ALL CHECKS PASSED · `verify-render` All render checks passed (run with the esbuild bundling step from its header; run directly under node it fails with `ERR_UNKNOWN_FILE_EXTENSION` on `.jsx`, same on untouched `main`) · `npm run build` ok.

Browser check (headless Chromium, built Ville bundle, fake signed-in session, mocked Supabase REST, fixture programme with and without `hrZones` / `cardioTypes` / `block.cardio`): 27 passed, 0 failed. Covers Today with a planned match, Today with a recorded extra, confirm / dismiss writes and no re-offer after reload, a skip day with an extra, Calendar form with and without `cardioTypes`, signed-out Today with no cardio fields, no page errors. Screenshots in `briefs/reports/step9-phase5-cardio-client/`.

## Hashes

- `engine.js` md5 (all five): **`c3eb98c215c5d5215bf468059fc07a44`** (was `a1ab926a…`)
- `program-schema.js` md5 (all five): `e67329ea75002a56204d6d4ae435e201` — unchanged
- `cardio.js` md5 (all five): `35e010b380dbe8fe1b4c55f1a782ffe4` — unchanged
- `wearables.js` md5 (four clients): `0378af25435485d406e39c8988127c83`
- `app.jsx` sha256 (four clients): `49410325311d53a8683b544da808446ba8e5f21ed18e84532dc16c4b2e1e518d` (was `d2221ad3…`)
- `test-cardio-client.mjs` md5 (four clients): `b160e078…`; `test-cardio.mjs` unchanged (`944ae9c5…`)

## Open

1. **Where a confirmed planned match is remembered.** `matchDay` only treats an `activities[]` entry with `source: "wearable"` as confirmed, and a planned confirm must not write one. So the key goes into `overrides[day].dismissedWorkouts`, which `matchDay` already reads. No second mechanism. The field name reads oddly for a confirm; renaming would be a `cardio.js` change.
2. **"Keep mine".** CLAUDE.md rule 6 (wearable data never overwrites the client's own log) outranks the brief. If the client has already typed a duration into the declared task, the planned offer shows "Keep mine" and only records the key; their number is not replaced. The brief did not cover this case.
3. **Planned match with nowhere to go becomes a recorded extra.** True when the block has no `cardio.durationTaskId`, the task is not a `number` task, or the workout has no duration. I handled the non-number-task case at runtime rather than stopping, since no live programme has `cardio` yet; `validate` already requires the id to exist in the block's exercises, not that it is a number task. Worth a validator rule in a later phase.
4. **Unplanned extras on a skip day.** Extras now also count in the Today ring (they are ordinary ticks in the "Extra Activity" section). Adherence and streak still skip the day.
5. **Browser check limits.** One client (Ville) was driven in the browser, against fixture data and a mocked backend; the other three builds share `app.jsx` byte-for-byte but were not individually screenshotted. No live-data run was possible from the session.
6. **Housekeeping.** `npm install` and the Coach `verify-browser` run touched `package-lock.json` and `briefs/reports/r3/*`; both reverted, not part of the PRs.

---

# Phase 5b — wearable strength workouts, outside cardio

## Result

Done, on the same five branches (the five open PRs update; no new PRs). Versions unchanged: clients 5.6.0-beta1, Coach 0.11.0. All gates `0 failed`; browser check now 40 passed, 0 failed (was 27).

## Changes

All four clients, identical:

- `src/core/cardio.js` — `STRENGTH_SPORTS`, `isStrengthWorkout`, `isCardioActivity`. `matchDay` now returns `{ planned, extras, strength }`; a strength workout goes only to `strength`, after the same dedupe / recorded-session / dismissed / confirmed filtering. `activityFromWorkout` tags a strength workout `kind: "strength"`, name "Strength training". `weeklyCardioMinutes` counts only `isCardioActivity` entries. Comments updated.
- `src/app.jsx` — `splitMatches` returns `strengthOnPlan`. On a day with a strength slot scheduled, the gym session is offered inside the strength block's card on Today, Train and Calendar ("Recorded strength session"); Confirm and Dismiss both only record the key (no ticks, no numbers, no activity). Otherwise (no strength slot, or a skip day) it appears under Recorded as "Strength · not cardio"; Confirm writes one `kind: "strength"` activity. A confirmed strength extra shows "not cardio" next to its details.
- `test-cardio.mjs` — 11 new checks (63 → 74). `test-cardio-client.mjs` — 5 new checks (18 → 23).
- `bundle.js` rebuilt (`styles.css` byte-identical).

Coach:

- `src/core/cardio.js` — byte-identical copy.
- `src/core/overview.js` — the "has extras" test uses `isCardioActivity`. The existing behaviour of `strengthTraining` matching the strength slot in the unplanned-session flag is untouched.
- `verify-overview.mjs` — 2 new checks: a week with a strength extra plus a cardio extra shows only the cardio minutes; a strength extra alone adds 0.
- `bundle.js` rebuilt. `COACH_VERSION` stays 0.11.0.
- Screenshots `6-…` to `6e-…` added; `browser-check.mjs` and its output updated.

## Gates

Per client (all four identical): `verify-program-delivery` 95 passed, 0 failed · `test-history-versions` 29 passed, 0 failed · `test-wearable-scope` 10 passed, 0 failed · `test-cardio` 74 passed, 0 failed · `test-cardio-client` 23 passed, 0 failed · `npm run build` ok.

Coach: `verify-adherence` 36/36 · `verify-browser` All browser checks passed · `verify-editor` 46 passed, 0 failed · `verify-overview` 81 passed, 0 failed · `verify-progress` 40 passed, 0 failed · `verify-publish` 31/31 · `verify-recovery` 12 passed, 0 failed · `verify-validator` ALL CHECKS PASSED · `verify` ALL CHECKS PASSED · `verify-render` All render checks passed (bundled first) · `npm run build` ok.

Browser check (Ville build, fixture data, mocked backend): 40 passed, 0 failed. New: gym session on a planned strength day (Today, Train, Calendar) offered inside the strength block, confirm writes only the key and leaves the weekly cardio line at 0; gym session on a day with no strength slot shown under Recorded as "Strength · not cardio", confirm writes one `kind: "strength"` activity, weekly cardio line stays 0 while a cardio extra the same day still counts, neither re-offered after reload.

## Hashes

- `cardio.js` md5 (all five): **`4fdcbaf1147c04dd5cef76ad829dc7b2`** (was `35e010b380dbe8fe1b4c55f1a782ffe4`)
- `engine.js` md5 (all five): `c3eb98c215c5d5215bf468059fc07a44` — unchanged
- `program-schema.js` md5 (all five): `e67329ea75002a56204d6d4ae435e201` — unchanged
- `app.jsx` sha256 (four clients): `a1af64aa7e3bf4e96406f53c0096838d82fe174a31e1877d758aca0e7b86b9ee` (was `49410325…`)
- `wearables.js` (four clients): identical, `9ae43dba4d4b…` sha256
- `test-cardio.mjs` md5 `6539a51f…`, `test-cardio-client.mjs` md5 `f9308d27…` (four clients)

## Open

1. **Acknowledge, not confirm.** On a planned strength day both buttons write the same thing (the key into `dismissedWorkouts`), as the brief specifies. The two-button UI therefore has no behavioural difference; say if you would rather show a single "OK".
2. **Order under Recorded.** Strength entries are listed after cardio extras.
3. **Unmapped strength in a cardio type.** If a coach ever lists `strengthTraining` in a `cardioTypes[].sports`, it is still treated as strength (tested), never as cardio.
4. **Existing data.** No strength extra has been confirmed anywhere yet (Phase 5 is unmerged), so no legacy entries need migrating.
5. Same browser-check limits as Phase 5: one client driven, fixture data, mocked backend.

## Follow-up — single "OK" on a planned strength day (chat, 1 Oct 2026)

John's call on Phase 5b open item 1: one button. `WorkoutOffer` now renders
Dismiss only when given an `onDismiss`; the strength offer passes `OK` only.
Behaviour unchanged (OK records the key, nothing else). Pushed by chat to the
same branches, with no version bump.

- `app.jsx` sha256 (four clients): `5a088e4e864c…`; `bundle.js` rebuilt.
  `cardio.js` `4fdcbaf1`, `engine.js` `c3eb98c2`, `program-schema.js`
  `e67329ea` unchanged.
- Gates per client: delivery 95/0, history 29/0, wearable-scope 10/0,
  cardio 74/0, cardio-client 23/0, build ok.
- Browser check: 41 passed, 0 failed (new: exactly one OK, no Dismiss, no
  Confirm). Screenshots `6-`, `6b-`, `6c-` re-shot. `browser-check.mjs` now
  takes `VILLE_ROOT` and `SHOT_DIR` from the environment.
