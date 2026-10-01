# Step 9 · Phase 4 — Program tab as data, for Henna, Joonatan and Juha

Status: **READY** · written 1 Oct 2026 from live `main` of all five repos
(clients 5.6.0-beta1: Henna `481811f`, Joonatan `07aadbc`, Ville `07d777f`,
Juha `9c4160a`; Coach 0.11.0 `5cde2da`). Branch: the session's own (see
README).
Versions: clients `5.6.0-beta1` → **`5.7.0-beta1`**; Coach `0.11.0` →
**`0.11.1`**, with the `index.html` `?v=` cache-bust.

## Why

Only Ville's Program tab is drawn from data. Henna, Joonatan and Juha still use
the hand-written `ProgramView` in their own `config.jsx`. That code reads the
compiled programme constants (`BLOCKS`, `MOBILITY`, `SCHEDULE`) and not the
programme delivered from the database, so it can drift from what the coach
publishes. This phase builds the three `programView` definitions, proves they
show the same content as today's tabs, and adds the few renderer features they
need.

**Code first, data second** (the Step 8 lesson). This session ships code and
the three definitions as files. **It writes nothing to the database.** Chat
writes the definitions to Supabase only after this code is deployed to all
four clients.

## Repos

All five: Henna-PTapp, Joonatan-PTapp, Ville-PTapp, Juha-PTapp, Coach-PTapp.
Read each client's `CLAUDE.md` first; its hard rules outrank this brief.

## Decisions (John, 1 Oct 2026)

- **Verbatim.** Convert the words exactly as they stand, including text that
  is now out of date. Do not fix wording; chat lists the outdated lines for
  John afterwards, as a separate data edit.
- **"The week" is generated from the schedule** for all three clients, using
  the existing `week` part, as Ville's is. Henna's hand-typed "Walk" labels on
  Tue/Thu go (walks are not in her schedule). Joonatan's "Rest" becomes his
  schedule's note, "Rest day". The paragraph under each table stays verbatim.
- The hand-written `ProgramView` in each `config.jsx` **stays** as the
  fallback for now. Removing it is a later cleanup, after the data has been
  live and verified.

## Facts (verified 1 Oct 2026)

- `app.jsx` (~line 2281) renders `GeneratedProgramView` when
  `PROGRAM.programView` is a non-empty array, otherwise `config.jsx`'s
  `ProgramView`. `PROGRAM` is the version in force at startup
  (`programs.js` `activeProgramAtStartup` → `pickActive`).
- `program-view.jsx` (247 lines, identical in all four clients) supports
  these part types: `heading`, `paragraph` (`text`, `strong` lead-in,
  `muted`), `lines`, `exercises` (`group`, `keys`, `excludeTyped`,
  `groupByBlock`), `mobility`, `week`, `table`, `nutrition`. Cards take
  `title`, `subtitle`, `color` token (`accent`, `accent2`, `cat:<name>`),
  `defaultOpen` and `titleFrom: { group, key }`.
- `program-schema.js` lists the allowed part types in
  `PROGRAM_VIEW_PART_TYPES` and the keys each part may carry in `PART_KEYS`.
  Note: `paragraph`'s keys are `["text", "strong"]`, but the renderer also
  reads `muted`. Check whether a `muted` paragraph raises a warning today and
  report what you find.
- What the three hand-written tabs use that the renderer cannot yet draw:
  1. **Bold or italic words mid-sentence.** Henna: "**Strength and toning**
     — and what you said it's really for: **more energy**", "*Then* add
     weight", bullet items starting "**Easy** — …".
  2. **Bullet and numbered lists.** Henna has one numbered list ("How to get
     stronger") and two bullet lists ("Your hands", "Walking"). They render
     in `TEXT_SECONDARY`.
  3. **A paragraph in `TEXT_SECONDARY`.** Plain paragraphs today are either
     default colour or muted.
  4. **Nutrition card labels and order.** Juha's hand-written card shows
     "Training day" first, then "Rest day", uppercase. The renderer prints
     the raw keys in `Object.keys` order, and the live definition stores
     `rest` before `training`.
- Joonatan's mobility card colour `#7FB88F` is exactly his theme's
  `CATS.mobility.color`, so use the `cat:mobility` token.
- Juha's hand-written week uses its own `dayLine`, which reads only
  strength, cardio and tennis. The generated `week` part reads every slot
  and prints "Slot — Option".
- The Coach editor passes `programView` through untouched (`editor.js`
  line 9), so later versions published from Coach keep it.

## Scope

### 1. Renderer additions — `program-view.jsx` (four clients, byte-identical)

Additive only. Everything Ville's live `programView` uses must render exactly
as before.

- **Rich text.** Wherever a part takes a text string (`paragraph.text`,
  `paragraph.strong`, `lines.items[]`, the new `list.items[]`), it may also
  take an array of segments. A segment is a string, `{ "strong": "…" }` or
  `{ "em": "…" }`. Render `<strong>` / `<em>`. Plain JSON only: no HTML, no
  markdown, never `dangerouslySetInnerHTML`.
- **`paragraph.tone`**: `"secondary"` or `"muted"`. The existing
  `muted: true` keeps working as before.
- **New part `list`**: `{ type: "list", items: [text], ordered?: boolean,
  tone?: "secondary" | "muted" }`. Render `<ol>` / `<ul>`, matching the
  hand-written lists' look (`list-decimal` / `list-disc ml-4 space-y-1`).
- **`nutrition`**: optional `order: ["training", "rest"]` and
  `labels: { training: "Training day", rest: "Rest day" }`. Without them,
  behaviour is unchanged.

### 2. Validator — `program-schema.js` (all five repos, byte-identical)

Add `list` to `PROGRAM_VIEW_PART_TYPES`, and the new keys to `PART_KEYS`.

**Errors** for:
- a malformed segment (not a string, `{strong}` or `{em}`);
- `list.items` that is not an array;
- a bad `tone`;
- `nutrition.order` naming a day type missing from `nutritionTargets`.

`SCHEMA_VERSION` stays 2. Nothing else in the file changes.

### 3. The three definitions

Build `programView` for Henna, Joonatan and Juha, card by card in the
current order, verbatim, using only the existing part types plus the
additions above.

- Strength day cards use `titleFrom`. Juha's No-Gym card keeps its own
  static title and subtitle ("No-Gym — Bodyweight + Band" / "Swap any strength
  day to this when travelling"), not the block's.
- Each card's colour uses the token that resolves to the same colour as
  today, in every theme the client has.

Save each one twice, byte-identical:
- in that client's own repo: `phase4/programview.json`. Never copy one
  client's file into another client's repo;
- in Coach: `briefs/data/phase4/<client>-programview.json`. Chat writes the
  data from these copies.

### 4. Equivalence test — new `test-program-view-equivalence.mjs`

Byte-identical across the four clients. It reads the local `config.jsx`, the
local compiled programme and the local `phase4/programview.json`. Ville has
no hand-written baseline to compare; for him the test runs only the
regression check (item 5).

- Render the old `ProgramView` and the new `GeneratedProgramView` (the
  compiled `PROGRAM` plus the new `programView`) with the same recording
  stubs for `Section` and `ExerciseList`. Use `react-dom/server`, as
  `test-program-view.mjs` does.
- Per card, extract and compare:
  - title and subtitle;
  - resolved colour and `defaultOpen`;
  - the body text in order, whitespace-normalised, with bold and italic
    preserved as markers;
  - each exercise list's ids, in order, with its colour.
- These must be **equal**, except for these allowed differences, and only
  these:
  - "The week" rows for all three clients (decision above). Print both
    versions in the report.
  - Nutrition label case.
  - Markup and styling (class names, fonts, spacing).
- Run it under every theme each client has.
- **Schema check.** Merge each new `programView` into the compiled programme
  and run `validate()`: **0 errors and no new warnings**.

### 5. Ville regression

Render Ville's `phase6/ville-programview.json` with the old and new renderer.
`renderToStaticMarkup` output must be byte-identical. Put this in the
equivalence test, so it also runs in Ville's repo.

### 6. Coach

Copy `program-schema.js` byte-identical and confirm all its gates pass.
Coach's `verify-validator` must accept the three new definitions, merged into
the matching programme rows in `fixtures/programs.json`. Note that the
fixture is stale: it lacks `joonatan-2026-09-29`, `juha-2026-09-29` and
`juha-2026-10`. Do not edit the fixture; use the rows it has and say which
in the report. Bump `COACH_VERSION` and the `?v=`.

### 7. Version and build

Set `APP_VERSION` to `5.7.0-beta1` in each `src/core/program-<client>.js`,
then `npm run build` in each repo.

## Out of scope

- **Any Supabase write.** The three definitions go to the database from chat,
  after deploy.
- Fixing any wording.
- Removing the hand-written `ProgramView` from `config.jsx`.
- `engine.js` (`c3eb98c2`) and `cardio.js` (`4fdcbaf1`): do not touch.
- A Coach editor for `programView`.
- Any other client screen.

## Gates

**Per client** — every gate must end `0 failed`:
- `verify-program-delivery`
- `test-history-versions`
- `test-wearable-scope`
- `test-cardio`
- `test-cardio-client`
- `test-program-view`
- `test-program-view-equivalence` (new)
- `npm run build`

**Coach** — every `verify-*.mjs` must end `0 failed`, including
`verify-render` bundled as its header describes, and `npm run build` must
pass.

**Browser check.** Headless Chromium on the built **Henna, Joonatan and Juha**
apps. Load each app's own definition through the mocked programmes endpoint,
as the Phase 5 script does, so the generated tab really renders. Take
screenshots of the full Program tab, old (no `programView`) and new, side by
side, into `briefs/reports/step9-phase4-program-tab-data/`, in both themes
(`amber-slate`, `rose-linen`) for each client. No page errors.

**Byte-identical:**
- `program-view.jsx`, `test-program-view-equivalence.mjs` and `app.jsx`
  across the four clients;
- `program-schema.js` across all five repos.

Report the new md5 values.

## Stop rules (beyond the README)

- A hand-written card needs something not listed in Scope 1 → stop, report
  what and where. Do not add a further part type.
- The equivalence test shows a difference outside the allowed list → stop,
  do not adjust the data to hide it.
- Ville's markup changes by even one byte → stop.
- `engine.js`, `cardio.js` or `app.jsx` would need a change → stop and
  report. (`app.jsx` should not need one: the switch already exists.)

## Done means

- One PR per repo (five), not merged.
- A report at `briefs/reports/step9-phase4-program-tab-data-report.md`,
  covering:
  - result, changes, gates and hashes;
  - the "The week" before/after rows;
  - whether a `muted` paragraph warns today;
  - which fixture rows were used;
  - open items.

Chat then:
1. verifies every branch;
2. John merges in the order Henna → Joonatan → Ville → Juha → Coach;
3. chat validates each definition against the **live** current rows
   (`henna-2026-09`, `joonatan-2026-09-29`, `juha-2026-10`, plus any later
   row that exists by then), writes `programView` into those rows, and
   checks each app shows the generated tab.
