# Coach redesign · R3 — Polish after John's first live look

Status: **DRAFT — collecting John's comments; do not run yet.** Written
29 Sep 2026 from Coach `main` at `767475b` (0.10.0). Branch: the session's
own (see README).

## Why

John opened 0.10.0 on his laptop (29 Sep, 23:00). Items below are his
comments, turned into concrete changes. Reference width: a **1440 px CSS
viewport** (a 14–16" laptop at default scaling). Everything must also work
at 1366 px.

## Repos

`Coach-PTapp` only. No change to `src/core/*` logic, `engine.js`,
`program-schema.js`, `cardio.js`, `dates.js`, Supabase or publishing.

## Scope

### 1. Week board visible in full, no horizontal scroll

Today the editor grid is `260px | 1fr | 320px` (`editor.jsx` ~line 822)
inside a 240 px sidebar, and the board forces `minWidth: 46rem` with
`minmax(6.5rem, 1fr)` columns (~line 394). At 1440 px the board gets
about 490 px and scrolls.

- Publish panel (right): **half its width**, 320 → 160–180 px. Its content
  must still fit: date input full width, Changes lines wrap, Check /
  Publish full width, the three collapsible sections unchanged.
- Session library (left): 260 → 200 px; card text truncates with a title
  tooltip rather than wrapping to three lines.
- Board: drop the fixed `minWidth`; columns `minmax(0, 1fr)`; cards
  truncate their label with a tooltip. **No horizontal scroll at
  ≥ 1366 px.** Below 1280 px keep today's stacked layout (scroll allowed
  there).
- Trim the editor card's own padding and the intro paragraph (one line,
  the rest behind an ⓘ toggle) so the board sits higher on the screen.

### 2. Client sidebar narrower

- Remove the programme name line under each client (John: not needed).
- Width = the longest name + dot + "(you)" + padding (`w-fit`, min 128 px,
  max 200 px), not 240 px.
- Footer: version and Sign out stay; the email moves into the Sign out
  button's `title` tooltip (it does not fit a narrow column).
- Paused client: keep a visible "paused" marker next to the name (it used
  to be in the removed line).

### 3. Training log day cards — label next to its value

Today `Pairs` puts measurements in a 2-column grid and `Row` uses
`justify-between`, so on a wide screen a label sits ~600 px from its
number and it is hard to see which value belongs to which label.

- `Pairs`: `grid-template-columns: repeat(auto-fill, minmax(14rem, 18rem))`
  — cells stay narrow however wide the screen is, so label and value stay
  close; more cells per row on wider screens.
- `Row` inside a cell: label left, value right, with a faint dotted leader
  (`border-bottom: 1px dotted T.border` on a flex spacer) so the eye
  follows the line.
- `Group` titles: 12 px gap above each group, 4 px below; tighten the
  card's vertical padding.
- Day cards: `max-width: 72rem` so the card does not stretch across an
  ultra-wide screen.
- Applies to every `Pairs` / `Row` user (Measurements, How it felt,
  Schedule changes, Exercises).

### 4. Cache-bust

`index.html` loads `bundle.js?v=` / `styles.css?v=`. Set both to the new
`COACH_VERSION` (0.10.1). From now on every version bump updates them.

## Gates

All existing gates `0 failed`, `npm run build` succeeds, plus a **headless
Chromium check at 1440 × 900 and 1366 × 768** (as in R2's report): the
week board's `scrollWidth <= clientWidth` for Juha and Ville; the sidebar is
narrower than 200 px; a Training log card's first Measurements label and its
value are less than 18rem apart. Report the measured numbers.

## Report

As README.
