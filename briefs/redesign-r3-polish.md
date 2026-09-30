# Coach redesign · R3 — Polish after John's first live look

Status: **READY.** Written 29–30 Sep 2026 from Coach `main` at `767475b` (0.10.0). Branch: the session's
own (see README).

## Why

John opened 0.10.0 on his laptop (29 Sep, 23:00). Items below are his
comments, turned into concrete changes. Reference width: a **1440 px CSS
viewport** (a 14–16" laptop at default scaling). Everything must also work
at 1366 px.

## Repos

`Coach-PTapp` only. No change to `src/core/*` logic (new pure helpers for Progress may go in
a new `src/core/progress.js`), `engine.js`,
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

### 4. Clearer borders — Programme tab (John, 30 Sep: item 1)

Every movable object and every section needs a visible edge. Today most
edges are `T.border` #2A3140 on #1A1F29, which barely shows.

- Add a token `THEME.borderStrong: "#3A4254"` in `config.jsx`.
- Sections (library, week board, selected block, publish panel, each
  collapsible): 1 px `borderStrong`, 12 px radius, panel background
  `#151922` (as the A3 design) so each area reads as a box.
- Movable cards (library cards, board cards): 1 px `borderStrong`, 3 px left
  bar in the slot colour, a slight hover lift (`translateY(-1px)` + border in
  the slot colour) and `cursor: grab`; selected card: 1 px accent border.
- Day columns on the board: 1 px `borderStrong`; while dragging over,
  dashed accent (as A3).

### 5. Programme tab clean-up (item 2)

- Remove the **Day notes** section from the publish panel: it duplicates the
  notes already editable on each board column ("Add note"). Keep the board
  notes and the Table view's note fields.
- Rename the copy buttons to say what they do: **"Make Week B same as A"** /
  **"Make Week A same as B"**, each with a `title`: "Copies every day of
  Week A onto Week B. Week B's current days are replaced." Keep the existing
  confirmation-free behaviour (the change shows in Changes and can be
  discarded).

### 6. More colour, as in the A1 and A3 designs (item 3)

The agreed boards are committed in `briefs/design/` (`A1-overview.dc.html`,
`A3-editor.dc.html`). Open them as text: the exact colours are in each
file's `renderVals()`. Apply those, not new ones:

- Overview week cells by state — done: bg `#1F2A24`, border `#35523F`;
  today: border `#E3A23C` on `#10131A`; planned (future): dashed `#3A4254`;
  status word coloured (`#7FB88F` done, `#E3A23C` today, `#8891A3`
  planned). Skip day: muted with the word "Skip".
- Metric boxes: note line coloured by the metric's `tone` (Recovery items
  `#4CB6C4`, good `#7FB88F`, warn `#C97388`); the big value stays white.
- Needs attention: a coloured dot per item (connection `#C97388`, zones
  `#8891A3`, unplanned `#4CB6C4`, draft `#E3A23C`, no log `#C97388`).
- Recent sessions: vendor coloured (Polar `#4CB6C4`, Oura `#8891A3`,
  logged `#7FB88F`).
- Programme tab: library group headings with a slot-coloured bar and
  slot-coloured heading text; card background tinted with the slot colour
  at ~8 % over `#1A1F29`; board cards likewise. Changed-in-draft cards get a
  teal (`#4CB6C4`) border, selected amber — as A3.
- Sidebar: the selected client row with the amber inset bar of A1
  (`box-shadow: inset 2px 0 0 #E3A23C`, bg `#232A36`).
- Slot colours come from `slotMetaFor(program, slot).color`, never
  hard-coded per slot name.

### 7. Recovery tab → **Progress** (item 4)

Today the tab shows one line chart plus two text lines. Replace it with a
**Progress** tab that shows what the client sees in their own app's
Progress view, plus the wearable trends. Coach already has the same
`engine.js` (byte-identical), so use its functions — do not reimplement:

1. **Recovery trends** — four small charts side by side (sleep h,
   readiness, HRV, resting HR), 30 days from `recovery.series`, each with
   its 7-day average as a second line and the latest value + "vs 30-day
   avg" printed above. Steps as a fifth small bar chart. Missing nights are
   gaps, never zero.
2. **Tracked items** — one chart card per `tracking` entry of the version
   in force, built exactly as the client app's `trackedCharts` does
   (Juha-PTapp `src/app.jsx` ~line 760: scales → value + rolling average,
   fixed 1..max axis; numbers → value + rolling average, or weekly total
   when `rollingTotal`; rates → rolling hit-rate %). Rows from
   `buildHistoryRows(log, overrides, resolver)` with the version-in-force
   resolver; last 60 points. Only cards with data are shown.
3. **Getting stronger** — exercise picker + `computeLoadSeries` line,
   last 30 points (as the client app).
4. **Consistency** — daily completion % over the last 60 days from the
   adherence rows, with a 7-day average line.
5. **Sessions by sport, 30 days** — horizontal bars from real, deduped
   workouts (count + minutes), coloured by sport.

Layout: responsive grid, 2–4 cards per row at 1440 px. Wearable connection
tags stay at the top. Tab id stays `recovery` in the hash for old links, but
label and heading read "Progress".

### 8. Cache-bust

`index.html` loads `bundle.js?v=` / `styles.css?v=`. Set both to the new
`COACH_VERSION` (0.10.1). From now on every version bump updates them.

## Gates

All existing gates `0 failed`, `npm run build` succeeds, plus a **headless
Chromium check at 1440 × 900 and 1366 × 768** (as in R2's report): the
week board's `scrollWidth <= clientWidth` for Juha and Ville; the sidebar is
narrower than 200 px; a Training log card's first Measurements label and its
value are less than 18rem apart; the Progress tab renders ≥ 4 recovery
charts for Juha and one tracked-item card per tracking entry with data.
Report the measured numbers and save screenshots of Overview, Programme,
Training log and Progress for Juha at 1440 px to `briefs/reports/r3/`
(PNG) so John and chat can see them without signing in.
- **verify-render** extended: Progress tab for every fixture person,
  including one with no wearables and one with no programme.

## Report

As README.
