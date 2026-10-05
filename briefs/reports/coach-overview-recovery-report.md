# Coach 0.12.2 — Overview polish and Training log redesign: report

**Result:** done, with one open decision (verify-browser.mjs, see Open).

## Changes
- `src/app.jsx` — `TabRow`: no scroll container at lg+; below lg `overflow-x-auto overflow-y-hidden`. The `-mb-px` overlap was removed (it overflowed the row by 1 px and would be clipped by `overflow-y-hidden`); the divider is now an inset box-shadow under the row. Underline measured at 2 px at 1440, 1280 and 390. Log tab now renders `Adherence` (new `compact` one-line mode) + `LogWeek`; paged list and "Show earlier days" removed. `DayCard` stays exported from `app.jsx` with the same props (thin wrapper; `verify-adherence` scans `app.jsx` for it).
- `src/core/overview.js` — `recoveryBars` replaced by `recoveryBaseline` (+ `fmtBaselineValue/Delta`).
- `src/overview.jsx` — "Recovery vs baseline" card, inline SVG.
- `src/core/logweek.js` (new) — `logWeek`, `dayDetail`, `vsLastTime`, `toneFor`, and the single `LOG_RULES` object holding every threshold.
- `src/logweek.jsx` (new) — `LogWeek` (week nav, 5 tiles, grid of real `<button>` columns) and `DayCardView` (design A).
- `src/config.jsx` — version 0.12.2; **one new token `warnBg: #2E2029`** (off-target cell tint, from the mockup).
- `index.html` `?v=0.12.2`; `bundle.js`, `styles.css` rebuilt.
- Tests: `verify-overview.mjs` (recovery checks replaced), `verify-render.mjs` (needle changed; LogWeek render added), new `verify-logweek.mjs`, new `verify-browser-overview.mjs`, new fixture `fixtures/logweek-juha.mjs` (the committed logs carry no `loads`).

## Gates (last line)
- verify.mjs: ALL CHECKS PASSED · verify-overview: 114 passed, 0 failed · verify-logweek: 84 passed, 0 failed · verify-adherence: 36/36 · verify-recovery: 12/0 · verify-progress: 40/0 · verify-editor: 64/0 · verify-publish: 31/31 · verify-validator: ALL CHECKS PASSED · verify-delete: 13/0
- verify-render (bundled): All render checks passed.
- verify-browser-overview: All overview browser checks passed (tab row 1440/1280/390; recovery card normal + worse week; Training log 1440 and 390: click, keyboard, ‹ ›, colours, grid scroll). No page errors.
- `npm run build`: clean.

## Screenshots (`briefs/reports/coach-overview-recovery/`)
recovery-normal-1440, recovery-worse-1440, overview-worse-1440, overview-390, training-log-1440/390, training-log-sat-1440/390.

## Open
1. **Decision needed — `verify-browser.mjs` (R3 layout check) now crashes** at its "training log" section (line ~165). It measures the old day card (the "Measurements" group, 18 rem label-to-value span, 72 rem max-width). §4 replaces that card, so the check cannot pass as written. Per the stop rule I did not edit it. It needs a new expectation, or retiring in favour of verify-browser-overview's log checks. Its other sections were not reached.
2. Verdict edge: a metric with a baseline but no readings in the last 7 nights has no `week`; the brief's wording then lets the verdict say "All within normal range" if nothing else is worse. I followed the brief literally; the card shows "No readings in 7 nights" on that row.
3. Choices not in the brief: session cell shows the block label before " — " (full label in the card); exercises "logged of planned" is null for a day with no log row (not 0); mobility on an opened day with no ticks is 0 (coloured off); "also recorded" line and "Other recorded fields" kept so nothing logged is hidden; the card's "vs yesterday" weigh-in falls back to the previous weigh-in's date.
4. Wearable workouts are not used by the Training log (cardio minutes come from `weeklyCardioMinutes`, as specified); the page footer still says "Exercise names still show as IDs" (not touched).
