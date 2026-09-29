# Coach redesign · R1 — Laptop shell and client Overview

Status: **READY** · written 29 Sep 2026 from Coach `main` at `a4b67cd`
(Coach 0.8.0). Branch: the session's own (see README).

## Why

John, 29 Sep 2026: the Coach app reads like a mobile page (`max-w-2xl`
column). It should use the whole laptop screen, give a clear overview of one
client at a time, and have proper navigation. He chose design **A1 + A2
depth**, not the all-clients comparison (clients are not compared with each
other). Design canvas (private to John, reference only):
`https://claude.ai/artifact/JHkND8WebJ3AMUQcsobvkn` — board **A1 · Client
workspace — Overview**. This session does not need to open it; everything
it needs is below.

R1 is the shell and the Overview. **R2** (separate brief, after R1 merges)
re-lays out the programme editor with a drag-and-drop week.

## Repos

`Coach-PTapp` only. Do **not** edit `engine.js`, `program-schema.js`,
`cardio.js`, `dates.js` (byte-identical with the client repos). No change to
`data.js` queries, Supabase, auth or publishing logic.

## Facts this brief rests on (verified 29 Sep 2026)

- `app.jsx` `CoachApp` loads everything once via `loadAll(user)` and already
  computes, per selected person: `adherence` (`buildAllAdherence`),
  `pctByDay`, `recovery` (`buildRecovery`), `connections`, `names`. Keep this
  hook block and its "every hook above the early returns" rule.
- `data.wearables.workouts[personId]`: `{vendor, day, sport, source,
  started_at, duration_minutes, distance_km, hr_avg, hr_max}`, 120 days.
  `data.wearables.days[personId]`: `{vendor, day, sleep_minutes, readiness,
  resting_hr, hrv, steps}`.
- `cardio.js`: `recordedWorkouts()` applies John's counting rule
  (`isRealSession`); `dedupe()` collapses the same session from two vendors
  (Polar kept). Use **both, in that order** for every workout figure.
  `weeklyCardioMinutes(weekStart, log, overrides, resolver)` is the weekly
  cardio total (planned blocks' logged minutes + confirmed extras).
- `buildRecovery()` returns `latest`, `avg7`, `avg30`, `series` (30 days,
  oldest first; `sleepH`, `readiness`, `hrv`, `rhr`). Days are already
  collapsed with Oura preferred.
- Each programme's `tracking` holds the client's own daily items:
  `rates` (tick-box, value in `payload.done[id]`), `scales` (`payload.scales[id]`),
  `numbers` (`payload.numbers[id]`, may carry `rollingTotal: 7`). Items are
  objects `{id, label, unit?}` — except Henna's `scales`, which are bare
  strings (`"energy"`, `"symptoms"`); label those with `labelFor()` from
  `shape.js`. Ville's include `chk-walk-pk1` (rate), `run-dist` (number,
  rollingTotal), `test-weight` (number).
- `resolveForDate(rows, date)` (`program-schema.js`) gives the version in
  force; `resolveSchedule(date, "auto", overrides, program)` gives a day's
  planned slots (`info.slots[slot]` = block key or null, `info.skip`).
- There is no streak function on the coach side. **Streak is not in R1.**

## Scope

### 1. Shell — `src/app.jsx`

- Replace `Shell`'s `max-w-2xl` column with a full-height two-column layout
  at ≥ 1024 px:
  - **Left sidebar, 240 px**: "Coach" wordmark; the roster (one row per
    person: status dot, name, programme name of the version in force); at the
    bottom `COACH_VERSION`, the signed-in email and Sign out. Replaces
    `Switcher` and `Header`.
  - **Main area**: client header (name, programme name + `effective_from` of
    the version in force, wearable connection tags) and a tab row:
    **Overview · Training log · Recovery · Programme · Versions**.
- Tabs reuse today's components, unchanged inside:
  - Training log → `Adherence` + the `DayCard` list + "Show earlier days".
  - Recovery → `Recovery`.
  - Programme → `ProgrammeEditor` with `defaultOpen` (R2 re-lays it out).
  - Versions → a table of this person's programme rows (id, name,
    `effective_from`, "in force" tag) and, below it, the existing
    `Publisher` (paste JSON) with `defaultOpen={false}`.
- Selected client and tab live in the URL hash (`#/<personId>/<tab>`) so a
  reload keeps the place. Unknown hash → first person, Overview.
- Below 1024 px: sidebar becomes the old top switcher; tabs scroll
  horizontally. It must still work on a phone, just not be designed for it.
- Paused / unnamed / no-days notices keep their current wording and show in
  the main area in place of the tabs' content.
- Sidebar status dot: amber if any **Needs attention** item (§3) exists,
  green otherwise, grey when paused. Each dot has a text label for screen
  readers.

### 2. Metric catalogue — new `src/core/overview.js` (pure, no React)

`metricCatalogue(ctx)` → `[{ group, items: [{ id, short, label }] }]` and
`computeMetric(id, ctx)` → `{ value, note, tone } | null`. `ctx` carries the
person's log rows, overrides, programme rows, wearable days/workouts,
`recovery`, adherence and `today` (injected, for tests).

**Never invent a number**: no data → `null`, rendered as "—" with a note
saying why (e.g. "No Oura connection", "Nothing logged in 7 days"). A real
zero (connected, no runs) is `0`.

Groups and items (ids fixed — they are stored):

| Group | id | Value |
|---|---|---|
| Training | `adh` | Mean `pct` of this ISO week's scored days so far (Mon → today), skip and null days excluded, as %. Note "n days scored". |
| Training | `cardio` | `weeklyCardioMinutes(monday, …)` for this week, in min. Note "Planned + confirmed extras". |
| Training | `run` | Sum of `distance_km` of real, deduped workouts with sport `running`, last 7 days incl. today, 1 decimal. Note: count of runs. |
| Training | `str` | Real, deduped `strengthTraining` workouts, last 7 days. Note "of N planned", N = days in the same 7 with a non-null `strength` slot. |
| Training | `sess30` | Real, deduped workouts in 30 days + total minutes (same numbers as `recovery.sessions30` / `sessionMinutes30`). |
| Recovery | `ready` `sleep` `hrv` `rhr` | `recovery.latest` value; note "▲/▼ x vs 7-day avg" from `avg7`. Sleep as `7h12`. |
| Recovery | `steps` | Steps of the latest collapsed day **before today**; note 7-day avg. |
| Daily checks · \<name\> | `trk:<trackingId>` | One item per `tracking` entry of the version **in force today**. rates → "x / 7 days" ticked; numbers with `rollingTotal` → 7-day sum + unit; other numbers → latest value + unit, note its date; scales → 7-day mean, 1 decimal. |

The group label is "Recovery" (the values are collapsed from Oura first,
Polar as fallback — calling it "Oura" would be inaccurate).

### 3. Overview tab — new component in `src/app.jsx` (or `src/overview.jsx`)

Grid, top to bottom:

1. **Four metric boxes.** Each: label (left), a small `<select>` top-right
   with the catalogue as `<optgroup>`s, big value, note line. `aria-label`
   "Choose what box n shows". Choice saved per client in `localStorage`
   `coachKpis_<personId>` = array of 4 ids (Coach has its own origin). Default
   `["adh","cardio","run","ready"]`. A stored id no longer in the catalogue
   (e.g. a tracking item removed in a new version) falls back to that box's
   default. Wrap storage in try/catch; work without it.
2. **This week · planned vs done** (2/3 width): Mon–Sun of this ISO week,
   one cell per day: planned block labels (from `slotOptions` short labels
   via the version in force that day), recorded real workouts (sport +
   minutes), adherence `pctLabel` for past days that have one, "Skip" for
   skip days, today outlined in accent.
3. **Needs attention** (1/3 width), each item a factual line, only these
   rules:
   - a wearable connection whose status is not `connected`, or last sync
     older than 48 h;
   - `usesHeartRate` true and no `hrZones` in the version in force;
   - a real workout this week on a day with no planned non-strength slot
     ("Unplanned session");
   - a saved editor draft for this person (`loadDraft`) — "Unpublished
     draft, saved <date>";
   - no logged day in the last 3 days.
   Empty → "Nothing needs attention."
4. **Recent sessions** (2/3): last 8 real, deduped workouts — date, sport
   label, duration `mm:ss`, km, avg/max HR, vendor.
5. **Recovery · 7 nights** (1/3): four small bar rows (sleep, readiness,
   HRV, resting HR) from the last 7 points of `recovery.series`, newest
   value printed. Missing night = empty bar, never zero height mislabelled
   as a value.

Visual: existing `THEME` tokens and fonts only, cards `T.card` on `T.bg`,
1 px `T.border`, 12 px radius. No new dependencies (lucide-react and
recharts are already there if wanted).

### 4. Version

`COACH_VERSION` → `0.9.0`. Footer text updated to describe the new layout.

## Out of scope

Programme editor internals (R2) · all-clients comparison view · exercise
catalogue page · streak · any client repo · Supabase.

## Gates

All existing, each ending `0 failed` (verify, verify-adherence,
verify-publish, verify-recovery, verify-validator, verify-editor,
verify-render) plus:

- **New `verify-overview.mjs`** — pure tests of `overview.js` with fixture
  logs/programmes and inline wearable rows, `today` fixed. At least:
  every catalogue id computes without throwing for Juha, Henna, Joonatan and
  a no-programme person; no-data cases return `null`, not 0; a connected
  person with no runs returns 0 km; Oura+Polar copies of one run count once;
  a `houseWork` and a 20-min confirmed walk are ignored; Henna's string
  scales get labels; `adh` excludes skip days; a stale stored id falls back.
- **verify-render** extended: render the Overview and every tab for each
  fixture person + the ghost; none empty; the paused notice renders.
- `npm run build` succeeds.

## Report

As README. Include a screenshot-free description of the Overview for Juha
(which metrics show "—" and why).
