# Report — Step 9 · Phase 3a (editor core)

- **Result** — done. All gates pass; Coach 0.6.0.

## Changes (Coach-PTapp)
- `src/core/editor.js` (new) — pure edit model: `startDraft`, `setBlockField`, `setExerciseField`, `listEditable`.
- `src/editor.jsx` (new) — "Edit programme" panel; Check → existing `preflight()`, Publish → existing `insertProgramVersion()`.
- `src/check-result.jsx` (new) — result/warning rendering extracted from `Publisher`, shared by both panels.
- `src/app.jsx` — Publisher uses `CheckResult`; `PersonPanel` renders `ProgrammeEditor` above the Publisher.
- `src/config.jsx` — `COACH_VERSION` 0.6.0.
- `verify-editor.mjs` (new, 13 checks); `verify-render.mjs` extended (editor collapsed/open ×4 clients, retired block read-only).
- `bundle.js`, `styles.css` rebuilt. `package-lock.json` not committed.

## Gates (last line)
- verify.mjs — ALL CHECKS PASSED
- verify-adherence.mjs — 36/36 checks passed.
- verify-publish.mjs — 31/31 checks passed.
- verify-recovery.mjs — 11 passed, 0 failed
- verify-validator.mjs — ALL CHECKS PASSED
- verify-editor.mjs — 13 passed, 0 failed
- verify-render (bundled) — All render checks passed.
- npm run build — ok

## Hashes
- engine.js `a1ab926aa93e75277ae660ca616e6d1c`, program-schema.js `e67329ea75002a56204d6d4ae435e201` — unchanged.

## Open
- No `CLAUDE.md` exists in Coach-PTapp; nothing to read.
- Brief silent on empty-string handling for exercise fields other than the numeric ones. Chosen: `name` cannot be empty (model throws); other text fields (`presc, detail, video, pattern, altName, altVideo, unit`) are removed when empty. Confirm or change.
- `startDraft` returns `{ draft, baseId, baseName, baseFrom }`, or `{ draft: null, reason }` when nothing is in force (brief: "`null` and a reason").
- UI: an empty block label / exercise name keeps the last valid draft value and disables Check until refilled (model refuses empties).
- `noGym` is edited as a checkbox (true sets the key; false removes it).
- Base draft is taken for tomorrow's date at open; the effective-date input can be changed afterwards without re-basing.
- Not exercised in a browser: render harness is static markup only; interactive typing/Publish untested.
