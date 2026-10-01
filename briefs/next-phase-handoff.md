# Next phase — handoff and steps

Written 1 Oct 2026. Follows `claude/step-9-handoff.md` (plan, decisions) and
`claude/coach-redesign.md` (redesign decisions). Re-verify live repos and the
database at the start of every session; this is a record, not a source of truth.

---

## 1. Where things stand (1 Oct 2026)

**Coach** — 0.10.1 on `main` (`c56226a`), coach.yellowg.fi.
- Laptop layout: client list · tabs Overview / Training log / Progress /
  Programme / Versions.
- Overview: four selectable metric boxes (Training, Recovery, the client's
  own daily checks), this week planned vs done, Needs attention, recent
  sessions, 7 nights.
- Programme editor: session library, drag-and-drop week board (Table view as
  keyboard path), selected-block editor, Check → Publish, saved drafts.
- Progress: recovery trends, the client's tracked-item charts, Getting
  stronger, Consistency, Sessions by sport.
- Verified by chat on main: all 10 gates `0 failed`, rebuild byte-identical,
  shared files untouched; Overview and Progress run against live data.

**Client apps** — Henna, Joonatan, Ville, Juha on 5.5.3-beta1. Shared files
byte-identical: `engine.js` a1ab926a (all 5 repos), `program-schema.js`
e67329ea, `cardio.js` 35e010b3.

**Wearables** — `wearable-sync` v6. Oura and Polar mapped; Polar sport ids 16
and 83 excluded. Oura rule: client-started or accepted real sports count;
housework / yardwork / stretching / other never; walks from 30 min.

**Done in Step 9** — Phases 0, 0b, 1 (Polar), 2 (cardio schema), 3a–3c (editor),
redesign R1–R3, probe cleanup.

---

## 2. Decisions (John, 1 Oct 2026)

- **D1 — skip days:** exercises done on a sick/travel skip day **show** in the
  client's Today view and **count** toward the weekly cardio total. The Today
  view must stop hiding them (today it hides them while the weekly total
  already counts them).
- **D2 — coach notes pushed to the app:** **not wanted.** Day notes stay as the
  programme's default weekday text.
- **D3 — cleanup:** approved and done 1 Oct:
  - table `wearable_probe` (32 rows) dropped; nothing referenced it (no view,
    foreign key, cron job or function code). `wearable_workouts` 898 rows and
    `wearable_days` 288 rows unaffected.
  - Edge function `wearable-probe` replaced by a stub (v3) that answers 410
    and now requires a JWT. The Supabase tools cannot delete a function:
    **John deletes it in the Supabase dashboard → Edge Functions →
    wearable-probe → Delete** (optional; the stub is harmless).

---

## 3. What is left

| # | Item | Who | Notes |
|---|---|---|---|
| A | Zone tables + cardio targets per client | John in Coach editor (no session) | Clears Cardio minutes "—" and zone warnings |
| B | Phase 5 — cardio in the client apps | 1 cloud session, 4 client repos | D1 decided — brief can be written |
| C | Phase 4 — Program tab as data for Henna, Joonatan, Juha | 1 cloud session + data from chat | After B (same `app.jsx`) |
| D | Ville Block 2 | John in Coach editor, chat verifies | Authored by **8 Nov**, in force **16 Nov** |
| F | Coach first live use | John | Report anything odd → small fix session |

Rule that still applies: **only one track mid-edit on the client `app.jsx` at a
time** — so B and C run one after the other, not in parallel.

---

## 4. Steps, in order

**Step 1 — John, this week (≈15 min per client, no session).**
Coach → client → Programme tab → right panel:
1. Heart-rate zones → "Use standard PK1/PK2/VK" (60–70 / 70–80 / 80–90 % of
   the max HR set in the client's app Settings). Ville's bike keeps its
   fixed-bpm text.
2. For each run / cardio block: fill the cardio target (duration, distance,
   zones, pace, note) and pick its **Duration field** (e.g. Ville `run-dur`).
   Without a duration field, Cardio minutes stays "—".
3. Check → Publish with an effective date (tomorrow or next Monday).
Chat then verifies the published rows (validator, diff, Overview numbers).

**Step 2 — chat writes the Phase 5 brief** — **written 1 Oct:
`briefs/step9-phase5-cardio-client.md`; a cloud session runs that file.**
(cardio client UI): the client
confirms or dismisses wearable matches; extras on any day; daily view shows
duration, distance, avg/max zone, pace, note. Carried notes:
- a confirmed PLANNED match is written as the block's logged duration
  (`numbers[durationTaskId]`), never as an activity — otherwise the weekly
  total counts it twice;
- D1: skip-day extras show in Today and count in the weekly total.
One session, four client repos, shared files stay byte-identical, version
5.6.0-beta1. Chat verifies → John merges in deploy order
Henna → Joonatan → Ville → Juha → Coach.

**Step 3 — Phase 4 brief** (after Phase 5 merges). Method that worked for
Ville: build each `programView` definition, prove render-equivalence against
the hand-written Program tab over a long date sweep, then switch. **Ship code
first, data second** (Step 8 lesson: data written before the validator that
accepts it is deployed gets rejected). Chat writes the three `programView`
definitions to the database only after the code is live.

**Step 4 — Ville Block 2 (target 8 Nov).** John authors it in the Coach
editor from Block 1 (effective 16 Nov; 16 Nov is Week B). Chat verifies the
draft before publishing: validator, diff, a date sweep across 15→16 Nov, and
Ville's app resolving the new version. Fallback if the editor gets in the
way: paste-and-validate on the Versions tab.

---

## 5. Working method (unchanged)

- Design and decisions in chat; chat owns Supabase. One cloud session per
  brief, briefs in `Coach-PTapp/briefs/`, reports in `briefs/reports/`.
- Sessions push to their own branch; John opens the PR from the link and
  merges; chat verifies every branch before merge (re-runs gates, rebuild
  check, live-data run where relevant).
- Every Coach version bump also updates `index.html` `?v=` cache-bust.
- Browser checks: sessions can't sign in, so UI briefs require a headless
  Chromium check with screenshots in `briefs/reports/<brief>/`. Recharts
  animates — screenshots need ≥ 4 s wait or animation off.
- Never pin a gate's pass count; gates must end `0 failed`.

## 6. References

- Design canvas (A1, A2, A3 boards): https://claude.ai/artifact/JHkND8WebJ3AMUQcsobvkn
- Committed design boards: `Coach-PTapp/briefs/design/`
- Supabase project `qpkdqyazdzhoohowkouy`; wearable cron key in the cron job.
