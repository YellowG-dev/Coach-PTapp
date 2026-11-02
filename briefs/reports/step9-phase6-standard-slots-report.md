# Report — step9-phase6-standard-slots

## Result

Done. All five repos changed; every gate ends `0 failed`; client browser check 26 passed / 0 failed, Coach browser check 20 passed / 0 failed. One PR per repo (five), not merged. **Nothing was written to Supabase.** `engine.js` is untouched. No existing category colour or icon changed (proved per client, both themes).

Start point: Phase 4 had merged, so each repo's branch was fast-forwarded to the latest `main` (clients 5.7.0-beta1, Coach 0.11.1) before any edit, and every fact in the brief was re-checked against that code. They held.

## Changes

All four clients (Henna, Joonatan, Ville, Juha):

- `src/core/program-schema.js` — the catalogue and validator rules (below), plus one small accessor, `slotHasChoices(program, slot)`, next to `slotOptionsFor`.
- `src/core/cardio.js` — non-cardio generalised from strength to strength + yoga (below).
- `src/core/categories.jsx` — new: `standardCats({ ACCENT, ACCENT_2 })`.
- `src/config.jsx` — `catsFor` is now `{ ...standardCats(...), ...own }`; the client's existing entries are moved unchanged into `own`.
- `src/app.jsx` — `nonCardio` handling and the Calendar rule (below).
- `src/core/program-<client>.js` — `APP_VERSION` `5.7.0-beta1` → `5.8.0-beta1`.
- `test-cardio.mjs` (74 → 87 checks), `test-cardio-client.mjs` (23 → 29), `verify-theme.mjs` — extended or corrected.
- `test-categories.mjs` — new, per client (each holds only its own pre-Phase-6 baseline).
- `bundle.js` rebuilt. `styles.css` unchanged by the build.

Coach:

- `src/core/program-schema.js`, `src/core/cardio.js` — byte-identical copies.
- `src/core/editor.js` — `availableStandardSlots`, `addSlot`, `standardSlotSpec`, `addStandardSlot`, `slotCountsAsCardio`, `cardioSlots`, `useStandardCardioTypes`, `SPORT_CHOICES`, `sportProblem`. Pure; they return new definitions and never mutate. There is no remove or rename operation.
- `src/editor.jsx` — Add slot picker in the session library (standard slots not yet in the programme, plus "Custom slot…" with id, label, colour); sports multi-select with a custom-code input that shows the validator's warning or error; Slot dropdown lists cardio slots only; "Use standard cardio types" button; Cardio target panel and the library meta line follow `slotCountsAsCardio` instead of a hard-coded `"strength"`.
- `src/core/overview.js` — a cardio target declared on a strength or yoga block no longer makes a week a "cardio week".
- `verify-editor.mjs`, `verify-overview.mjs`, `verify-render.mjs` — new checks (below).
- `COACH_VERSION` `0.11.1` → `0.12.0`, `index.html` `?v=` → `0.12.0`, `bundle.js` and `styles.css` rebuilt.
- `briefs/reports/step9-phase6-standard-slots/` — screenshots, both browser scripts and their output.

### What was built, in the brief's order

1. **Catalogue** (`program-schema.js`): `STANDARD_SLOTS` (strength, run, walk, swim, bike, yoga, cardio, with `id, label, color, countsAsCardio, sports`), `KNOWN_SPORTS` (the 20 codes), `NON_CARDIO_SLOTS = ["strength","yoga"]`. Validator: **warning** for a cardio-type sport not in `KNOWN_SPORTS`; **error** for `strengthTraining` or `yoga` in a cardio type.
2. **Non-cardio sports** (`cardio.js`): `matchDay` returns `{ planned, extras, nonCardio }`, where `nonCardio` is `{ workout, slot }[]`, with the same dedupe / recorded-session / dismissed / confirmed filtering. `activityFromWorkout` gives a strength or yoga workout `kind: <slot>` and the catalogue label as `name`. `isCardioActivity` is false for any `kind` in `NON_CARDIO_SLOTS`. `weeklyCardioMinutes` skips every non-cardio slot. `isStrengthWorkout` and `STRENGTH_SPORTS` stay exported for one release; new helper `nonCardioSlotFor(sport)`.
3. **Client app**: on a day where that slot is scheduled (not skipped), a strength or yoga workout is offered inside that block with a single **OK** (acknowledge only). Otherwise it is listed under Recorded as "`<Label>` · not cardio"; Confirm writes the `kind` entry; a confirmed non-cardio extra shows "not cardio". The Calendar leaves a slot with only `{ value: null }` options out of the legend and the day panel, but still shows it on a day that has a value in it (the legend also keeps it while the displayed month has such a day). The Today "Cardio this week" line ignores a duration task declared on a strength or yoga block.
4. **Categories**: `standardCats` with the icons from the brief. All seven icons exist in the pinned `lucide-react` 1.35.0 (checked), so none was replaced.
5. **Coach editor**: as listed above.

## Catalogue colours chosen

| Slot | Colour | Where it comes from |
|---|---|---|
| strength | `#E3A23C` | live programmes (Joonatan, Juha, Ville) |
| run | `#E8806A` | new |
| walk | `#C9D46B` | new |
| swim | `#2E86DE` | new |
| bike | `#6FCF97` | live (Ville) |
| yoga | `#A99BC9` | live (all) |
| cardio | `#4CB6C4` | live (Juha's slot) |

Distinctness: smallest pairwise CIE76 distance across the seven is 33.9 (swim/yoga). The new three are at least 20 from the existing Testing and Activity category colours. `verify-theme.mjs` now includes these fills in its contrast scan: in `amber-slate` the worst is swim at 4.94:1 against the dark `ON_ACCENT` (limit 4.5), so it passes; `rose-linen` already carries the owner-accepted "ON_ACCENT on every category fill" exception, so the light-coloured fills are covered by it as for every existing category.

## Gates

Per client (identical results in all four): `verify-program-delivery` `95 passed, 0 failed` · `test-history-versions` `29 passed, 0 failed` · `test-wearable-scope` `10 passed, 0 failed` · `test-cardio` `87 passed, 0 failed` · `test-cardio-client` `29 passed, 0 failed` · `test-program-view` `46 passed, 0 failed` · `test-program-view-equivalence` Henna `198` / Joonatan `170` / Ville `37` / Juha `254`, all `0 failed` · `test-overrides` `7 passed, 0 failed` · `verify-otp` `9 passed, 0 failed` · `verify-start` `5 passed, 0 failed` · `verify-time` `32 passed, 0 failed` · `verify-train` `ALL CHECKS PASSED` · `verify-wearables` `19 passed, 0 failed` · `verify-theme` `ALL CHECKS PASSED` · `test-categories` Henna `28` / Joonatan `28` / Ville `34` / Juha `36`, all `0 failed` · `npm run build` ok.

Coach: `verify-adherence` 36/36 · `verify-browser` All browser checks passed · `verify-editor` `64 passed, 0 failed` · `verify-overview` `84 passed, 0 failed` · `verify-progress` `40 passed, 0 failed` · `verify-publish` 31/31 · `verify-recovery` `12 passed, 0 failed` · `verify-validator` ALL CHECKS PASSED · `verify` ALL CHECKS PASSED · `verify-render` All render checks passed (bundled first, as its header describes) · `npm run build` ok.

New checks, against the brief:

- `test-cardio.mjs`: yoga → `nonCardio` with `slot: "yoga"`, never `planned`/`extras`; strength behaviour unchanged; confirmed yoga adds 0 and a cardio extra the same day still counts; a planned yoga block with a `durationTaskId` adds 0 (and a walk block with the same task adds 45); a client-specific slot (tennis) counts; legacy `{ id, name }` and existing `kind: "strength"` entries behave as before; the catalogue is as agreed; the validator errors on a `strengthTraining` or `yoga` cardio type and warns on an unknown code.
- `test-cardio-client.mjs`: yoga on a planned yoga day → OK only, no write but the key; yoga on another day → one `kind: "yoga"` activity worth 0; skip day → under Recorded; the Calendar rule hides an option-less slot and shows it on a day with a value (also on a skip day).
- `test-categories.mjs` (per client): for both themes, every pre-Phase-6 category has the same label, colour and icon (Henna in full: strength, mobility, yoga, check, rest, activity), and every standard slot has a category with an icon.
- `verify-editor.mjs`: each standard slot, all of them at once, and a custom slot added to each of the four fixture programmes validate with 0 errors and change nothing else; adding an existing id throws; "Use standard cardio types" output validates; Joonatan's live-style `["Assault bike"]` / `["Bike"]` give warnings, not errors, and publishing is not blocked; a yoga or strength cardio type blocks publishing; Henna: add Walk, add a block, place it on Tue/Thu in both weeks, the whole publish check passes.
- `verify-overview.mjs`: a week with yoga plus a cardio extra shows only the cardio minutes; a cardio target on a yoga block is not a cardio week.

### Browser checks (headless Chromium, `briefs/reports/step9-phase6-standard-slots/`)

- **Client, Henna build** (a delivered programme built with the Coach editor functions, loaded through the mocked programmes endpoint; both themes for the Today checks): the Walk session shows in Today with the walk colour (`rgb(201, 212, 107)`) and the Footprints icon; the planned-walk suggestion and target line appear; a Polar walking workout confirms into the walk duration task and moves "Cardio this week"; a yoga workout on a day with no yoga slot is listed as "Yoga · not cardio" and its confirmed entry leaves the weekly line unchanged; on a planned yoga day the offer sits in the yoga block with a single OK, and OK writes only the key; the Calendar leaves an empty Walk slot out of the legend and the day panel, and shows it on a day that has a value. No page errors.
- **Coach, real editor UI**: add the Walk slot from the picker (swatch `#C9D46B`), add the block "Easy walk", drag it onto Tue and Thu, Check passes (Publish offered, nothing blocking). Then "Use standard cardio types" (five types, only Walk linked), the Slot dropdowns list only cardio slots, a custom code "Assault bike" shows the validator warning and can be added, "yoga" shows the validator error and cannot. A Walk block shows the Cardio target panel; a strength block does not. No page errors.

## Hashes

- `program-schema.js` md5, all five repos: **`69fc9ea5768a1854a396f350cdb49b07`** (was `ab1bff34…`)
- `cardio.js` md5, all five repos: **`37723a004fc76893d24565f8de41625a`** (was `4fdcbaf1…`)
- `engine.js` md5, all five repos: `c3eb98c215c5d5215bf468059fc07a44` — unchanged
- `app.jsx` sha256, four clients: **`64101b076f95d08a901899be42fc7868759eba3edbfead56d44095b6dded2ac2`** (was `5a088e4e…`)
- `categories.jsx` md5, four clients: **`5cd5a31a7593453e5d3ab80cc06c4917`**
- `test-cardio.mjs` md5, four clients: `bde2deb477e850f0826e138faf6d922a`
- `test-cardio-client.mjs` md5, four clients: `8473565c269069a228cfa2d3c7d38730`
- `verify-theme.mjs` md5, four clients: `7d8fed9eccbdb1c47558a78124df0884`
- Coach `editor.js` md5: `215944d562aad9b3a4ab9e9af316c0ac`

## Open

1. **Pre-existing failure fixed.** `verify-theme.mjs` already failed on `main` (`six components call useTheme()`: found 7), because Phase 5 added `WorkoutOffer`. I corrected the expectation to seven. It is not one of the three gates in `CLAUDE.md`, but the brief says every existing gate must end `0 failed`.
2. **`activityFromWorkout` now names a strength workout "Strength", not "Strength training".** The brief says the name comes from the catalogue label; the catalogue label is "Strength". Entries already confirmed under Phase 5b keep their stored name "Strength training" and keep `kind: "strength"` (tested). Only the text on a new offer changes.
3. **Strength takes the theme accent, not the catalogue hex, in `standardCats`.** All four clients already draw strength in `ACCENT`, and the catalogue value `#E3A23C` is that colour under the dark theme. Every other standard category uses its catalogue colour, so a slot's Today card matches its Calendar dot. `ACCENT_2` is accepted for the call shape but unused.
4. **`verify-render.mjs` (Coach) changed.** It used Henna's yoga block as its example of a block with a Cardio target panel. Under Phase 6 yoga has none, so it now asserts the panel is absent for Henna's yoga and Juha's strength blocks and still present for Juha's cardio and Ville's run blocks.
5. **"Use standard cardio types" keeps types the programme already has** (matched by id) and only adds the missing ones, so pressing it never overwrites the coach's edits. Existing custom types listing the same sport can still draw the existing "listed under more than one cardio type" warning.
6. **A manual "Other" extra typed as "Yoga"** in the Calendar form still counts as cardio, as the brief says.
7. **Coach Overview's "unplanned session" flag** still treats only `strengthTraining` as matching the strength slot. A yoga workout is matched through the existing "any planned non-strength slot" rule. I did not change it; mapping yoga to the yoga slot the same way would be a small follow-up.
8. **No automatic Walk for existing clients.** Nothing adds a slot to a live programme; that stays John's choice in the editor after deploy, as the brief says.
9. **Live-data run not possible from the session.** Both browser checks use fixture data and a mocked backend; the Coach one runs the real editor UI on the fixture rows (`fixtures/programs.json` is stale as before and was not edited).
