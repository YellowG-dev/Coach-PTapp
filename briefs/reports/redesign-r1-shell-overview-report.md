# Report — redesign-r1-shell-overview

**Result** — done. Gates all pass; PR not opened (see Open).

## Changes (Coach-PTapp)
- `src/core/overview.js` (new) — pure metric catalogue, `computeMetric`, week grid, recent sessions, 7-night bars, needs-attention rules, KPI fallback.
- `src/overview.jsx` (new) — Overview tab layout: 4 selectable metric boxes, week, attention, sessions, recovery bars.
- `src/app.jsx` — sidebar + client header + tab row replacing `Header`/`Switcher`; hash routing `#/<personId>/<tab>`; `PersonPanel` now per tab (exported); Versions table; attention dots.
- `src/config.jsx` — `COACH_VERSION` 0.9.0.
- `verify-overview.mjs` (new), `verify-render.mjs` (extended: Overview + every tab for Juha, Henna, Joonatan, Ville, ghost; paused notice; hash parsing).
- `bundle.js`, `styles.css` — rebuilt.

## Gates (last line of each)
- verify: ALL CHECKS PASSED
- verify-adherence: 36/36 checks passed.
- verify-publish: 31/31 checks passed.
- verify-recovery: 12 passed, 0 failed
- verify-validator: ALL CHECKS PASSED
- verify-editor: 40 passed, 0 failed
- verify-overview: 61 passed, 0 failed
- verify-render: All render checks passed.
- `npm run build`: succeeds.

## Hashes
`engine.js`, `program-schema.js`, `cardio.js`, `dates.js` untouched (no diff vs `origin/main`).

## Overview for Juha (today = 29 Sep, no live data was read)
Default boxes: Adherence (this ISO week, scored days only); Cardio minutes shows **"—"**: Juha's programme (both versions) has no block with `cardio.durationTaskId`, so there is no cardio total to compute; Running km and Readiness come from Oura/Polar and show "—" only if no wearable rows exist. Steps use the latest day before today. Daily-check boxes ("—" when nothing logged in 7 days) are offered per tracking item.

## Open
1. **Cardio "—" instead of 0.** `weeklyCardioMinutes` returns 0 when no task is declared; the Overview returns null ("No cardio in the programme") when no block in the week declares cardio and no extra is confirmed, per "never invent a number". Say if you want 0.
2. **`recovery.sessions30` is not deduped** and uses the real clock (`recovery.js`), unlike the brief's description. `sess30` on the Overview is deduped, so it can be lower than the "recorded sessions in 30 days" line on the Recovery tab when Oura+Polar duplicates exist. `recovery.js` left unchanged (out of scope).
3. **Unplanned-session rule is literal**: a real workout on a day with no planned non-strength slot. A Polar `strengthTraining` on a strength-only day is therefore flagged. Likely noisy for Juha; needs your call.
4. **7-night bars** use seven calendar nights ending at the newest night in `recovery.series` (series has only days that have rows, so "last 7 points" would hide gaps).
5. **No-days notice** replaces only the Training log tab; Overview still renders, because wearable data can exist before any log.
6. A connected row with no `last_synced_at` is not flagged (rule text: status ≠ connected, or sync older than 48 h).
7. `verify-render.mjs` needed `--packages=external` (header updated): the Recovery tab now pulls in recharts, which the old `--external:react` command could not bundle.
8. Not seen in a real browser: sign-in is a magic link, so layout was verified by render tests and by confirming the responsive classes are in `styles.css`.
