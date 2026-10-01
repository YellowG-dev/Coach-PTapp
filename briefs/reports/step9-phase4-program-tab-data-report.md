# Report — step9-phase4-program-tab-data

## Result

Done. Code and the three `programView` definitions are in place, all gates end `0 failed`, browser check 30 passed / 0 failed. One PR per repo (five), not merged. **Nothing was written to Supabase.** `engine.js`, `cardio.js` and `app.jsx` are untouched.

Branch note: the Phase 5 PRs had all been merged, so each repo's branch `claude/cardio-client-phase5-c9598v` was fast-forwarded to the latest `main` (clients 5.6.0-beta1, Coach 0.11.0) before this work, rather than stacking on merged history.

## Changes

All four clients (Henna, Joonatan, Ville, Juha):

- `src/core/program-view.jsx` — additive only. Rich text (`rich()`: a string, `{strong}` or `{em}` segments, built from React elements, no HTML, no `dangerouslySetInnerHTML`; a plain string is returned untouched so existing markup is unchanged). `paragraph.tone`. New `list` part (`<ul class="list-disc ml-4 space-y-1">` / `<ol class="list-decimal …">`). `nutrition` `order` and `labels`.
- `src/core/program-schema.js` — `list` added to `PROGRAM_VIEW_PART_TYPES`; new keys in `PART_KEYS` (`paragraph.tone`, `list.items/ordered/tone`, `nutrition.order/labels`). New errors: malformed segment, `list.items` not an array, bad `tone`, `nutrition.order` naming a day type not in `nutritionTargets`. `SCHEMA_VERSION` stays 2. Existing messages for plain strings are unchanged.
- `src/core/program-<client>.js` — `APP_VERSION` `5.6.0-beta1` → `5.7.0-beta1`.
- `test-program-view-equivalence.mjs` — new, identical in all four (see Gates).
- `phase4/program-view.before.jsx` — a frozen, verbatim copy of the renderer as it stood on `main` before this phase (md5 `1845c199…`). Not in the brief's file list, but item 5 needs "the old renderer" to compare against and a copy of a file in git history cannot be read by a test at run time. Identical in all four repos.
- `bundle.js` rebuilt. `styles.css` rebuilt: Joonatan, Ville and Juha gain `.ml-4`, `.list-decimal`, `.list-disc` (9 lines) because the renderer now references them; Henna already had them from its hand-written tab.

Per client only:

- Henna, Joonatan, Juha: `phase4/programview.json` (their own definition; never copied into another client's repo). 11, 9 and 15 cards.
- Ville: nothing beyond the shared files. His live definition renders unchanged.

Coach:

- `src/core/program-schema.js` — byte-identical copy.
- `verify-validator.mjs` — new section: each of the three definitions, merged into its fixture row, must pass `validateSchema` with 0 errors and no new warnings, and `validateProgramEdit` must report nothing.
- `COACH_VERSION` `0.11.0` → `0.11.1`, `index.html` `?v=` → `0.11.1`, `bundle.js` and `styles.css` rebuilt (`styles.css` gains the same three list classes).
- `briefs/data/phase4/{henna,joonatan,juha}-programview.json` — byte-identical copies of the client files (checked with `cmp`). Chat writes the data from these.
- `briefs/reports/step9-phase4-program-tab-data/` — six side-by-side screenshots, the browser script and its output.

## Gates

Per client (all four identical results):

- `verify-program-delivery` — `95 passed, 0 failed`
- `test-history-versions` — `29 passed, 0 failed`
- `test-wearable-scope` — `10 passed, 0 failed`
- `test-cardio` — `74 passed, 0 failed`
- `test-cardio-client` — `23 passed, 0 failed`
- `test-program-view` — `46 passed, 0 failed`
- `test-program-view-equivalence` — Henna `198 passed, 0 failed` · Joonatan `170 passed, 0 failed` · Juha `254 passed, 0 failed` · Ville `37 passed, 0 failed`
- `npm run build` — ok

Coach: `verify-adherence` 36/36 · `verify-browser` All browser checks passed · `verify-editor` 46 passed, 0 failed · `verify-overview` 81 passed, 0 failed · `verify-progress` 40 passed, 0 failed · `verify-publish` 31/31 · `verify-recovery` 12 passed, 0 failed · `verify-validator` ALL CHECKS PASSED · `verify` ALL CHECKS PASSED · `verify-render` All render checks passed (bundled first, as its header describes) · `npm run build` ok.

What `test-program-view-equivalence` proves:

- Per card, under both themes of each client (`amber-slate`, `rose-linen`): title, subtitle, resolved colour, `defaultOpen`, body text in order with bold, italic and text tone kept as markers, and each exercise list's ids, order and colour are **equal** between the hand-written tab and the data version. The only differences are the allowed ones below.
- Schema: compiled programme + new `programView` → 0 errors and no warning the bare programme does not already have.
- Ville regression: his `phase6/ville-programview.json` renders **byte-identical** `renderToStaticMarkup` output with the frozen old renderer and the new one, under every theme, on both a Ville-shaped programme and the local client's compiled programme.
- The comparison can fail: I mutated each definition (a word, a card colour, an italic, a tone, a list's block key, `defaultOpen`, Juha's nutrition order and a numbered line) and each mutation failed the test; the originals pass.
- Renderer additions (segments, escaping of markup in text, tone, `muted` still working, `ul`/`ol`, nutrition order/labels) and the 15 validator cases are in the same file.

## Hashes

- `program-schema.js` md5, all five repos: **`ab1bff345f595dd60c0d539d0164f401`** (was `e67329ea…`)
- `program-view.jsx` md5, four clients: **`88eb188c…`** (was `1845c199…`)
- `test-program-view-equivalence.mjs` md5, four clients: `817f0477…`
- `app.jsx` sha256, four clients: `5a088e4e864c…` — unchanged from `main`
- `engine.js` `c3eb98c2…` and `cardio.js` `4fdcbaf1…`, all five: unchanged
- `phase4/program-view.before.jsx`, four clients: `1845c199…`
- `phase4/programview.json`: Henna `de4df3d7…`, Joonatan `bdab35e0…`, Juha `40bfbf2a…` (each equal to its Coach copy)

## "The week" — before / after

The one allowed content difference, as decided: the data version is generated from each client's schedule.

Henna (old hand-written → new generated):

| | old | new |
|---|---|---|
| Mon | Day A | Strength — Day A |
| Tue | Walk | Rest |
| Wed | Day B | Strength — Day B |
| Thu | Walk | Rest |
| Fri | Day C | Strength — Day C |
| Sat | Rest | Rest |
| Sun | Yoga | Yoga — Yoga |

Joonatan:

| | old | new |
|---|---|---|
| Mon | Rest | Rest day |
| Tue | Legs | Strength — Legs |
| Wed | Rest | Rest day |
| Thu | Full Body | Strength — Full Body |
| Fri | Rest | Rest day |
| Sat | Push | Strength — Push |
| Sun | Pull | Strength — Pull |

Juha: old and new are identical on the compiled programme (Mon Tennis — Coached lesson · Tue Strength — A · Wed Cardio — Hard Intervals · Thu Strength — B · Fri Rest day · Sat Strength — C + Cardio — Zone 2 · Sun Cardio — Hard Intervals). The old `dayLine` only read strength, cardio and tennis; the generated one reads every slot, and Juha's schedule has no yoga values, so nothing differs today.

## Other allowed differences seen

- Nutrition label case (Juha): the data version prints "Training day" / "Rest day" in the renderer's semibold style, where the old card used uppercase small caps.
- Markup: Juha's "Upside" list is one muted paragraph with `<br/>` in the old tab and a `lines` part (one paragraph per line) in the new. Same words and tone; the test folds the `lines` wrapper into one paragraph before comparing.

## Does a `muted` paragraph warn today?

No. `muted` is in `COMMON_PART_KEYS` (`["type","color","muted"]`), so it is accepted on any part and raises no "unrecognised key" warning, and it is validated as a boolean. Only `tone` was missing for `paragraph`; `muted: true` keeps working and wins over `tone` if both are set. Covered by a test.

## Fixture rows used

`fixtures/programs.json` is stale (no `joonatan-2026-09-29`, `juha-2026-09-29`, `juha-2026-10`) and was not edited. Each definition was merged into the newest row the fixture has: Henna → `henna-2026-09`, Joonatan → `joonatan-2026-09`, Juha → `juha-2026-09-23`. All three: 0 errors, 0 warnings. Chat should repeat this against the live rows before writing.

## Browser check

Headless Chromium on the built Henna, Joonatan and Juha apps, with a fake signed-in session and mocked Supabase. The new run loads the app's own definition (compiled programme + `programView`) from the mocked programmes endpoint, lets the app cache it, reloads so it is the programme in force, and opens every card; the old run gets no programme row, so the hand-written tab shows. 30 checks: old shows the hand-written tab, the cached row carries `programView`, the generated tab shows its cards and text from inside a collapsed card, no page errors; for each client under `amber-slate` and `rose-linen`. Screenshots (old left, new right) are in `briefs/reports/step9-phase4-program-tab-data/`.

## Open

1. **Wording is verbatim, including text that is now out of date**, as decided. Chat should list the outdated lines for John (for example Juha's "This block — 7 Sep – 18 Oct 2026" and "Week of 28 Sep in this block").
2. **`list.items` empty array is an error**, like `lines`. The brief listed only "not an array"; an empty list would render a bare bullet container.
3. **`nutrition.order` that names only some day types**: the renderer shows those first and then the rest, so no target is ever hidden. The validator only errors on a name that is not in `nutritionTargets`.
4. **`paragraph.strong` also accepts segments** (the brief lists it among the text fields), and the lead-in keeps its semibold span.
5. **Frozen old renderer** `phase4/program-view.before.jsx` is a new file in all four repos. Delete it with the hand-written `ProgramView` when that is removed.
6. **Hand-written `ProgramView` stays** in each `config.jsx`, as decided; it is the fallback.
7. **Equivalence is against the compiled programmes.** Chat's live-row check should confirm the delivered rows still carry the block keys the definitions name (`strength` a/b/c, Joonatan push/pull/legs/full, Juha `bodyweight`, `cardio.hard`, Henna `yoga.session`); the schema validator will flag a missing one as an error.
8. **Coach `styles.css`** changed only by the three list classes, picked up from the shared renderer.
