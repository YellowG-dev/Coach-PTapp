# Report — redesign-r3-polish

**Result** — done. All gates pass. PR not opened (not requested); John merges and deploys.

## Changes (Coach-PTapp, 0.10.1)
- `src/config.jsx` — 0.10.1; tokens `borderStrong` #3A4254, `panel` #151922, `rowSelected`, `doneBg`, `doneBorder`.
- `index.html` — `bundle.js?v=` / `styles.css?v=` → 0.10.1 (was 0.5.0).
- `src/editor.jsx` — §1 grid 200 / flexible / 170 px at ≥ 1280 px, board without fixed min-width (kept only below 1280 px, where the layout stacks), truncating cards with tooltips, one-line intro with ⓘ toggle, tighter padding; §4 boxed sections (1 px `borderStrong`, 12 px radius, `panel`), movable cards with slot bar, hover lift, `grab`, selected/changed borders, dashed accent only on the day being dragged over; §5 Day notes section removed, buttons "Make Week B same as A" / "Make Week A same as B" with the requested `title` (Workspace and Table view); §6 slot-coloured library headings, 8 % slot tint on cards, teal border for cards changed in the draft (block or schedule cell differs from the base version), amber for selected.
- `src/app.jsx` — §2 sidebar `w-fit`, 128–200 px, no programme line, email in the Sign out `title`, "paused" marker, A1 selected row; §3 `Pairs` (auto-fill 14–18 rem), `Row` with dotted leader, `Group` 12 / 4 px, day card `max-width: 72rem`; §7 tab label "Progress" (id stays `recovery`); old `Recovery` component removed.
- `src/overview.jsx` — §6 week cells by state (done / today / planned / skip), metric note colours by tone, attention dots, vendor colours.
- `src/core/progress.js` (new, pure) and `src/progress.jsx` (new) — §7 Progress tab: five recovery charts (steps as bars), one card per tracking entry with data (engine.js `buildHistoryRows` / `computeSeries` / `computeRollingTotal`), Getting stronger, Consistency, Sessions by sport.
- Tests: `verify-progress.mjs` (new, 40 checks), `verify-render.mjs` (Progress tab for every fixture person incl. no wearable and no programme, plus Juha with wearables; Day notes gone; new button labels), `verify-browser.mjs` (new; headless Chromium check below).
- `bundle.js`, `styles.css` rebuilt.

## Gates (last line)
verify: ALL CHECKS PASSED · verify-adherence: 36/36 · verify-publish: 31/31 · verify-recovery: 12 passed, 0 failed · verify-validator: ALL CHECKS PASSED · verify-editor: 46 passed, 0 failed · verify-overview: 78 passed, 0 failed · verify-progress: 40 passed, 0 failed · verify-render: All render checks passed. · verify-browser: All browser checks passed. · `npm run build` succeeds.

## Browser check (Chromium, `node verify-browser.mjs`; numbers in `briefs/reports/r3/measurements.json`)
| | 1440 × 900 | 1366 × 768 |
|---|---|---|
| Week board scrollWidth / clientWidth, Juha | 774 / 774 | 700 / 700 |
| Same, Ville | 774 / 774 | 700 / 700 |
| Page horizontal scroll | none | none |
| Day column width | 104 px | 93 px |
| Library / publish panel | 200 / 170 px | 200 / 170 px |
| Sidebar width | 160 px | 160 px |
| Training log, first Measurements label → its value ("Alcohol" → "0"), left edge to left edge | 281 px = 17.6 rem | 281 px = 17.6 rem |
| Day card max-width | 1152 px (72 rem) | 1152 px |
| Progress, Juha: recovery charts drawn | 5 | 5 |
| Progress, Juha: tracked cards / tracking entries with data | 10 / 10 | 10 / 10 |

Screenshots (Juha, 1440 px): `briefs/reports/r3/overview-juha-1440.png`, `programme-juha-1440.png`, `training-log-juha-1440.png` (top 1300 px), `progress-juha-1440.png`.

## Hashes
`engine.js` (byte-identical to Juha-PTapp `src/core/engine.js`), `program-schema.js`, `cardio.js`, `dates.js`: no diff vs the branch base.

## Open
1. **Client repo read.** The brief says "Coach only" but points at Juha-PTapp `src/app.jsx` `trackedCharts`. I read that repo (read-only, public) to copy the logic; nothing there was changed.
2. **Data in the browser check is fixture + synthetic.** The fixtures hold no wearable rows and no logged set weights, so `verify-browser.mjs` adds inline Oura nights (two missing), five workouts and four bench-press sessions for Juha. "Today" is fixed at 30 Sep 2026 so Ville's programme (from 28 Sep) is in force. Fonts are the fallback stack (no network), so widths with IBM Plex may differ by a few px.
3. **Tracked-card colours.** The client apps' `CATS` palette is client data and Coach has none, so cards use the client's own fallbacks: teal for scales, amber for numbers, grey for rates. Tracking entries' `cat` is ignored.
4. **Consistency** is built from Coach's scored adherence days (skip days and unscheduled days absent, today excluded), 60 days; the client app's version plots every logged day for 30.
5. **Recovery trends** expand `recovery.series` to 30 calendar days so missing nights are real gaps; steps come from the collapsed wearable days (the series has no steps).
6. **Overview cell "past, nothing done"** is not in the A1 palette; it gets a neutral solid cell, with "Not logged" only if something was planned.
7. Sidebar bug found and fixed on the way: nav buttons were inline-level, so the column's natural width was the sum of all names (494 px, clamped to 200). Buttons are now `lg:block`.
8. Not opened as a PR.
