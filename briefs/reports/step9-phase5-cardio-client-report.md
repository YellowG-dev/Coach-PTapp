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
