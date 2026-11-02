# Step 9 · Phase 3b — report

**Result** — done. Coach 0.7.0; all gates pass; nothing outside Coach touched.

## Changes (Coach-PTapp)
- `src/core/editor.js` — pure model additions: `catalogue`, `takenExerciseIds` (helper for the caller-built id set), `addExistingExercise`, `addNewExercise`, `removeExercise`, `moveExercise`, `addBlock`, `retireBlock`, `restoreBlock`, `setBlockCardio`, `setHrZones`, `standardHrZones`, `setCardioTypes`, `slugify`. All return new objects; `listEditable` now also returns each block's `cardio`.
- `src/editor.jsx` — Add existing / Add new / Remove / ↑↓ per exercise, Add block / Retire / Restore, Cardio target group (non-strength slots), Heart-rate zones table, Cardio types list; inline one-line confirmation (history kept) for Remove and Retire; model refusals shown as a notice; every change clears the Check.
- `verify-editor.mjs` — 16 new checks (29 total); `verify-render.mjs` — new controls asserted for every fixture client.
- `src/config.jsx` — `COACH_VERSION` 0.7.0. `bundle.js`, `styles.css` rebuilt.

## Gates (last line)
- verify.mjs: ALL CHECKS PASSED · verify-adherence: 36/36 · verify-publish: 31/31 · verify-recovery: 12 passed, 0 failed · verify-validator: ALL CHECKS PASSED
- verify-editor: 29 passed, 0 failed
- verify-render: All render checks passed.
- npm run build: OK. `package-lock.json` restored (not committed).

## Hashes (md5, unchanged)
engine.js `a1ab926aa93e75277ae660ca616e6d1c` · program-schema.js `e67329ea75002a56204d6d4ae435e201` · cardio.js `35e010b380dbe8fe1b4c55f1a782ffe4`

## Open
Decisions the brief left open, made minimally (change if unwanted):
- `addNewExercise` throws for a `number` exercise without `unit`, and for a name with no a–z/0–9 (empty slug). Generated ids/keys are truncated so `-N` suffixes stay ≤ 32 chars.
- `retireBlock` throws if already retired; `restoreBlock` throws if not retired; `addBlock`/`retireBlock`/`restoreBlock` throw if the slot has no `slotOptions`. A restored block's option label is its block label (the original option label is not stored).
- Standard zone ids/labels are `PK1`/`PK2`/`VK` (matches the brief's `zoneAvg: "PK1"`).
- Cardio-type ids are minted from the label (`slugify`, `other` reserved) and are read-only afterwards; zone ids remain editable (a broken reference is blocked by preflight).
- Editing a block's label (3a) still does not update its `slotOptions` label.
- UI interactions (clicks, inline confirmation, pickers) were verified by static render and the model tests only, not in a live browser.
