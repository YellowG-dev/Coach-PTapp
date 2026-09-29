# Report — redesign-r2-editor-layout

**Result** — done. All gates pass. PR not opened (not requested).

## Changes (Coach-PTapp)
- `src/core/overview.js` — §0a `str` counts days (app log `byCat.strength.done > 0` or watch, once per day) within the window minus days with no version in force; note `of N planned` / `· since d.m.`; null "No programme in force"; no wearable needed. §0b "Unplanned session" now = a workout matching nothing planned (strength ↔ strength block; other sports via `cardioTypes` slot, else any non-strength slot or a client activity; skip days flag).
- `src/core/editor.js` — `moveScheduleCell` (move, swap, same-day no-op, empty source throws, retired-but-placed blocks movable). `diffDefinitions` unchanged: a swap already lists as its two cell changes.
- `src/editor.jsx` — Programme editor re-laid out: header (base version, `no changes` / `draft · saved hh:mm`, Week A/B tabs with the effective week labelled, Copy), session library (slot bar, cards, `+ Add block`, collapsed Retired (n) with Restore), week board (native HTML5 drag: library → day, day → day, × remove, drop highlight, refused drops show the `notice`, note click-to-edit), Table toggle showing the unchanged select grid, selected-block editor (extracted unchanged), publish panel (date + week, `Changes · n`, Check/Publish, collapsible Heart-rate zones / Cardio types / Day notes). 3 columns at ≥ 1280 px (260 / flexible / 320), stacked below. `ProgrammeEditor` gained optional `defaultView` / `defaultSelected` props for render tests.
- `src/config.jsx` — 0.10.0. `bundle.js`, `styles.css` rebuilt.
- Tests: `verify-overview` (+17: §0 cases), `verify-editor` (+6: `moveScheduleCell`, incl. Ville Block 2 identical to the `setScheduleCell` scenario and passing `preflight`), `verify-render` (editor board + table views for Juha, Henna, Joonatan, Ville: 7 day columns, Monday first).

## Gates (last line)
verify: ALL CHECKS PASSED · verify-adherence: 36/36 · verify-publish: 31/31 · verify-recovery: 12 passed, 0 failed · verify-validator: ALL CHECKS PASSED · verify-editor: 46 passed, 0 failed · verify-overview: 78 passed, 0 failed · verify-render: All render checks passed. · `npm run build` succeeds.

## Hashes
`engine.js`, `program-schema.js`, `cardio.js`, `dates.js`: no diff vs `origin/main`.

## Browser check
Ran the editor in headless Chromium against Ville's fixture: 3 columns at 1600 px, stacked at 1100 px; synthetic drag events confirmed move to empty day, swap (Sun long ↔ Tue easy gives the three expected diff lines), library drop, ×, note edit, Table toggle; no console errors.

## Open
1. Expected live values in §0a (Ville `2`, "of 2 planned · since 28.9."; Juha `0`, "of 1 planned") are not checked against live data (no DB access); the logic is covered by fixture tests.
2. Board dates: the effective date's week tab shows that week's dates; the other tab shows the following week's.
3. The `saved hh:mm` time is the time of the last write to browser storage in this session; a resumed draft shows `saved —` until the next edit.
4. Real-mouse drag in Playwright mis-targeted the source card once (the app received the events correctly); swap was verified with dispatched drag events instead.
5. Touch drag is out of scope; Table view is the no-drag path.
