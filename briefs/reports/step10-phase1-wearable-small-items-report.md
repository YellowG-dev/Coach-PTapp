# Report — Step 10 Phase 1: wearable small items

Run 14 Nov 2026 by a cloud session. Brief: `briefs/step10-phase1-wearable-small-items.md`.

## Result

**Done.** All of A1–A2, B1–B4, C1–C3 and D are in, every gate passes in all five
repos, and both browser checks pass. Not merged. Supabase was not touched.

The starting point matched the brief exactly: `main` at `5e62427` / `18599be` /
`cca85dc` / `d2957aa` / `9b5f6c3`, and every shared md5 as listed. Baseline gates
matched too: `verify-wearables.mjs` ended `17 passed, 2 failed` in all 4 clients,
and everything else passed.

## Changes

Branch `claude/clever-mayer-dukoul` in every repo (the session's branch).

**All 4 clients (same files, same content except `program-<client>.js`)**
- `src/core/wearables.js`: A2. `buildRecovery(days, workouts, subjectId = null, now = new Date())`. `now` sets only the 30-day session cutoff, and existing callers are unchanged.
- `verify-wearables.mjs`: A2. Passes a fixed `now` of `2026-09-24T12:00:00`. Adds 4 checks (test 6): a 31-day-old session drops out, day 30 stays in, nights are untouched, and omitting the fourth argument still works.
- `src/core/program-schema.js`: B1, B2 and C1. Adds `SKI_BLOCKS` and the Ski catalogue entry after `cardio`. The catalogue comment now says eight slots and documents `blocks`. Adds the validator rules for `auto` (see C1).
- `src/core/engine.js`: C2. Adds `stepsAutoTicks(sections, rec, steps)`. `mapTask` now passes `auto` through, but only on a task that declares it. Without that, `buildSections` output has no `auto` for the function to read.
- `src/core/categories.jsx`: B4. Adds `ski: MountainSnow`. lucide-react 1.35.0 is installed and exports it.
- `src/app.jsx`: C3. Adds the `cloudMerged` flag, the auto-tick effect, and the steps line. Details below.
- `src/core/program-<client>.js`: `APP_VERSION` is now `5.10.0-beta1`.
- `test-cardio.mjs`: two existing checks pinned the seven-slot catalogue. They now expect eight slots with `ski: ["crossCountrySkiing"]`.
- `test-steps-autotick.mjs` (new; tests 1, 2 and 3): the pure rule, the version boundary, and the merge gate driven through the real app. It sits next to `test-notes.mjs` and uses the same fake-browser method.
- `bundle.js` was rebuilt. `styles.css` did not change.

**Coach**
- `src/core/engine.js`: A1 (client file copied in), then C2. It is now the same file as the clients'.
- `src/core/program-schema.js`: the shared copy (B1, B2, C1).
- `src/core/editor.js`: B3. `addStandardSlot` writes the template blocks into `blocks[id]` and adds one `slotOptions` entry per block after "None". It throws, naming the id, if a template task id already exists. A slot without a template is added empty, as before. The comment on "Use standard cardio types" now lists Ski.
- `src/config.jsx`: `COACH_VERSION` is now `0.13.0`.
- `verify-editor.mjs`: 4 existing checks pinned the seven-slot catalogue and "every added slot is empty". They now expect Ski, and expect its 3 blocks and options.
- `verify-auto-validator.mjs` (new; test 4, next to `verify-validator.mjs`).
- `verify-ski-slot.mjs` (new; test 5, next to `verify-editor.mjs`).
- `bundle.js` was rebuilt. `styles.css` did not change.
- `briefs/reports/step10-phase1/` holds the browser-check scripts, their output, and the screenshots.

**C3 in `app.jsx`**
- **Which steps:** the signed-in user's own `oura` row in `wearables.days` where `day === dateKey(d)` and `user_id === authUser.id`. A missing row, or one where steps is not a number, means unknown and does not count as 0. `collapseDays` is not used.
- **When:** an effect over today and the 6 days before it. It re-runs when the steps, the log or the overrides change. Each day is built with `buildSections(d, …, programForDate)`, so each day uses the programme in force that day. Writes go through `setLog`, `store.saveJSON("log")` and `queueLogDay`, as in `confirmPlannedWorkout`. Inside the updater each id is checked again with `done[id] === undefined`, so a tap made since the last render wins.
- **Merge gate:** `cloudMerged` is set to `true` only after `pullAndMerge` resolves non-null, and only if the same user is still signed in. It is reset whenever the signed-in user changes. Signed out, or with a failed pull, it stays `false` for the whole session.
- **Display:** a task with `auto` shows `presc · 8,412 / 10,000 steps` (en-US thousands separator). With an Oura connection but no number for that day it shows `presc · steps not synced yet`. With no Oura connection it shows the presc alone. The checkbox is unchanged and stays tappable.

**C1 rules** (each error names the path and the task id):
- `source` must be `"steps"`.
- `min` must be an integer of at least 1.
- A task that has a `type` cannot carry `auto`. This includes an explicit `type: "exercise"`, because the brief says "the task has a `type`".
- `auto` on a block exercise is an error: "auto is only for daily tasks".
- Both `tasks` and every `byDayType` variant's `tasks` are checked.
- All 11 programmes in `fixtures/programs.json` still validate with 0 errors and 0 warnings.

**Ski colour, re-checked the Phase 6 way:** `#B5DDF2` was compared by CIE76 ΔE with the other 7 slot colours and every category colour in all 4 `config.jsx` files (31 colours).
- Nearest is Cardio `#4CB6C4` at **ΔE 24.7**. Next is check/rest `#8891A3` at 27.8.
- Contrast against the dark `ON_ACCENT` `#10131A` is **12.91:1**.
- `verify-theme.mjs` (whose scan now includes Ski) passes in all 4 clients.

## Gates

Fresh `npm install` in every repo. Each line is the last line of that gate's output.

| Gate | Henna | Joonatan | Ville | Juha |
|---|---|---|---|---|
| test-block-sports | 30 passed, 0 failed | 30 / 0 | 30 / 0 | 30 / 0 |
| test-cardio-client | 32 passed, 0 failed | 32 / 0 | 32 / 0 | 32 / 0 |
| test-cardio | 101 passed, 0 failed | 101 / 0 | 101 / 0 | 101 / 0 |
| test-categories | 30 passed, 0 failed | 30 / 0 | 36 / 0 | 38 / 0 |
| test-history-versions | 29 passed, 0 failed | 29 / 0 | 29 / 0 | 29 / 0 |
| test-notes | 15 passed, 0 failed | 15 / 0 | 15 / 0 | 15 / 0 |
| test-overrides | 7 passed, 0 failed | 7 / 0 | 7 / 0 | 7 / 0 |
| test-program-view-equivalence | 198 passed, 0 failed | 170 / 0 | 37 / 0 | 254 / 0 |
| test-program-view | 46 passed, 0 failed | 46 / 0 | 46 / 0 | 46 / 0 |
| test-progress-merge | 15 passed, 0 failed | 15 / 0 | 15 / 0 | 15 / 0 |
| **test-steps-autotick** (new) | 32 passed, 0 failed | 32 / 0 | 32 / 0 | 32 / 0 |
| test-wearable-results | 29 passed, 0 failed | 29 / 0 | 29 / 0 | 29 / 0 |
| test-wearable-scope | 10 passed, 0 failed | 10 / 0 | 10 / 0 | 10 / 0 |
| verify-otp | 9 passed, 0 failed (first run) | 9 / 0 | 9 / 0 | 9 / 0 |
| verify-program-delivery | 95 passed, 0 failed | 95 / 0 | 95 / 0 | 95 / 0 |
| verify-start | 5 passed, 0 failed | 5 / 0 | 5 / 0 | 5 / 0 |
| verify-theme | ALL CHECKS PASSED | ✓ | ✓ | ✓ |
| verify-time | 32 passed, 0 failed | 32 / 0 | 32 / 0 | 32 / 0 |
| verify-train | ALL CHECKS PASSED | ✓ | ✓ | ✓ |
| **verify-wearables** (A2) | 23 passed, 0 failed | 23 / 0 | 23 / 0 | 23 / 0 |

Coach:
- test-oura-hr: 17 passed, 0 failed
- test-wearable-results: 29 passed, 0 failed
- verify-adherence: 36/36 checks passed.
- **verify-auto-validator** (new): 9 passed, 0 failed
- verify-browser-overview: All overview browser checks passed.
- verify-browser: All browser checks passed.
- verify-delete: 13 passed, 0 failed
- verify-editor: 64 passed, 0 failed
- verify-logweek: 84 passed, 0 failed
- verify-overview: 114 passed, 0 failed
- verify-progress: 40 passed, 0 failed
- verify-publish: 31/31 checks passed.
- verify-recovery: 12 passed, 0 failed
- **verify-ski-slot** (new): 13 passed, 0 failed
- verify-validator: ALL CHECKS PASSED
- verify: ALL CHECKS PASSED
- verify-render (bundled, as its header says): All render checks passed.

**Build.** `npm run build` succeeded in all 5 repos, and a second build was byte-identical to the first (sha256 prefixes):

| Repo | `bundle.js` | `styles.css` |
|---|---|---|
| Henna | `d56a361e5f430d5d` | `4e8d02347409c81b` |
| Joonatan | `bddf9629203ba471` | `6f71895c8882d425` |
| Ville | `2bea5915dbeb9745` | `e33c89faea71dfc5` |
| Juha | `e9af10765614fe19` | `bc7bcbfe05bc1608` |
| Coach | `ed3cb502b5271f59` | `c690607a1542edf7` |

**Merge gate is tested, and the test can fail.** Removing `!cloudMerged ||` from the effect makes `test-steps-autotick.mjs` fail 2 checks: a tick was written and an upload was sent while the pull had failed. The gate was then put back; the file's md5 matched the copy taken before the edit.

**Browser checks** (headless Chromium; scripts and output are in `briefs/reports/step10-phase1/`):
- **Client:** `18 passed, 0 failed`. Juha build with Coach fixture `juha-2026-10` plus `auto` on `chk-walk` (min 10,000), delivered through a stubbed Supabase.
  - `1-client-steps-8412-unticked.png`: the line reads "Daily step target · 8,412 / 10,000 steps" and the task is unticked.
  - `2-client-steps-10250-ticked.png`: the task ticked itself, and `done.chk-walk === true` is in the log.
  - `3-client-steps-not-synced-yet.png`: shows "· steps not synced yet".
  - `4-client-manual-untick-stays.png`: after a tap at 10,250 steps the task stays un-ticked through a tab change and a full reload, and stays `false` in the store.
  - A fifth case, no Oura connection, shows the presc alone (no screenshot).
- **Coach:** `13 passed, 0 failed`. Ville fixture `ville-2026-10`, with Ski added from the picker.
  - Swatch `#B5DDF2`.
  - XC-Classic, XC-Skate and Downhill show under Ski. The Downhill block lists its session task and four result fields, and has the Cardio target panel.
  - Check passes (`coach-1…`, `coach-2…`).
  - "Use standard cardio types" adds a Ski type linked to `ski`, and Check still passes (`coach-3…`).

## Hashes

sha256 (md5 prefix in brackets). Each group was identical across the repos listed.

| File | Repos | Hash |
|---|---|---|
| `src/app.jsx` | 4 clients | `fd0a79dc6d702fc7bd8abe75b71c842fd73ce681efcdd47a23a1d73c6da1970d` (`a1a10e0a`) |
| `src/core/categories.jsx` | 4 clients | `eb3b10c24233ea380887c9971f751404a25050a8fc57c5c300b6115d5db905aa` (`47a9ce53`) |
| `src/core/wearables.js` | 4 clients | `0b2be98d91b008b8f188de4af84e8905131ee29411944ed468bb4cf3c6515660` (`58fcfb08`) |
| `src/core/program-schema.js` | all 5 | `eeb4e59ba60bc94b75f1fb20fc8b7c74d837f203eb71406022d804f041b138aa` (`525e1bfe`) |
| `src/core/cardio.js` | all 5, unchanged | `8c39caecd3c22310444ffcf37835c32a1ff17d9106c2addfb9f42605b179381c` (`b2bf0cfd`) |
| `src/core/engine.js` | all 5 | `3e979159e922fc42b6e26fdbd0f07252ab502b2c7a3747b1d78ce999fed041ba` (`019bfb83`) |

These files are also identical across the 4 clients: `verify-wearables.mjs`, `test-cardio.mjs` and `test-steps-autotick.mjs`.

## Open

1. **Coach `src/core/recovery.js` has the same time bomb.** Line 129 takes its 30-day cutoff from `new Date()`. A2 covered only the 4 clients, so it was not changed. `verify-recovery.mjs` cannot expire: its `sessions30` checks date their workouts `new Date()` (today) rather than with a fixed date. The code is therefore not a test failure, but it is untestable against a fixed fixture. Worth the same `now` parameter in a later brief.
2. **`CLAUDE.md`'s gate list** does not yet name `test-steps-autotick.mjs`. `CLAUDE.md` was not in this brief's scope, so it was not edited. Suggest adding it with the line "MUST end "0 failed" — a steps tick waits for the first cloud merge".
3. **Interpretations, flagged rather than decided silently:**
   - "anywhere in the programme" (B3) is read as every task id in block exercises, daily `tasks` and `byDayType` variants, `mobility`, and `testing.items[].tasks`.
   - C1's "the task has a `type`" also rejects an explicit `type: "exercise"`.
   - The steps line appears on any day that is viewed. Auto-ticking itself is limited to today and the 6 days before, as specified.
4. **Fixture programmes are older than the live ones**, as the brief notes. The new rules were run against all 11 fixtures. Chat still needs to re-run them against every live version before merge.
5. **Side effects that were not committed:**
   - Running the existing Coach browser gates rewrote screenshots in `briefs/reports/coach-overview-recovery/` and `briefs/reports/r3/`.
   - `npm install` rewrote Coach's `package-lock.json`.
   - All of these were restored, and none is in the commits.
   - Tailwind v4 scans the whole repo, so a test script that names a utility class can change `styles.css`. One browser-check script did; it was reworded so `styles.css` stays unchanged.
6. **§8 questions for John are untouched:** classic or skate, Nordic walking in Walk, and Ville's old "Polar:NN" labels.

Deploy order: Henna → Joonatan → Ville → Juha → Coach. §6 data changes come after merge.
