# Step 9 · Phase 0 — housekeeping (client side)

Status: **READY** · written 28 Sep 2026 from a verified snapshot (below).
Branch in every repo: `step9/phase0-housekeeping`.

## Why

Three small defects that have been carried for weeks. Batched into one session
so they do not ride along with real work and muddy its diff.

## Repos

`Henna-PTapp`, `Joonatan-PTapp`, `Ville-PTapp`, `Juha-PTapp` (all four
clients), plus `Coach-PTapp` for the report only.

This session **edits `src/app.jsx`**. Per CLAUDE.md rule 3 only one task may do
that at a time — confirm in the report that no other open PR touches it.

## Snapshot this brief was written against (verified 28 Sep 2026)

| repo | HEAD | `app.jsx` md5 | `engine.js` | `program-schema.js` | `wearables.js` |
|---|---|---|---|---|---|
| Henna | e22604a | 5b6cf5d2… | a1ab926a… | eb061639… | 01ed0257… |
| Joonatan | 9cca9c9 | 5b6cf5d2… | a1ab926a… | eb061639… | 01ed0257… |
| Ville | c9fecf7 | 5b6cf5d2… | a1ab926a… | eb061639… | 01ed0257… |
| Juha | f1fdd47 | 5b6cf5d2… | a1ab926a… | eb061639… | 01ed0257… |

All at `APP_VERSION = "5.5.1-beta1"`. In Ville's repo: delivery 95/0,
history-versions 29/0, wearable-scope 10/0, program-view 46/0;
`verify-otp.mjs` crashes for a missing `jsdom`. If HEADs differ when you start,
check that the three items below still apply before changing anything.

## Scope

### 1. `jsdom` so `verify-otp.mjs` runs — all four repos

- Add `jsdom` as a **devDependency** (`npm install -D jsdom`), commit
  `package.json` and `package-lock.json`.
- Run `node verify-otp.mjs`. Whatever it reports on first run is
  **information, not a regression**: record it in the report, do not fix
  failures in this session.

Why: the sign-in-with-code check has never actually run in a fresh clone, so
nobody knows whether it passes.

### 2. `removeActivity` deletes more than the activity — all four repos

Current code, `src/app.jsx` ~line 668:

```js
if (day.activities.length === 0 && !PROGRAM.slots.some((sl) => sl in day)) delete next[key];
```

Removing a day's last extra activity deletes the **whole override entry** for
that day unless it holds a slot name from the *current* programme. That loses:

- `deload: true` (the weekly deload toggle writes it onto every day),
- `note`,
- a slot override stored under a slot name an **older programme version**
  used (the same trigger as the `swapBlock` fix already shipped).

Fix: remove only the `activities` key, and delete the day entry only if nothing
else is left — the same pattern `setSkip` and `setWeekDeload` already use:

```js
if (day.activities.length === 0) delete day.activities;
if (Object.keys(day).length === 0) delete next[key]; else next[key] = day;
```

To make it testable, move the pure part into a function taking
`(overrides, key, id) -> nextOverrides`, exported from a **new** file
`src/core/overrides.js`, and have `removeActivity` call it. Do not put it in
`engine.js` — that file is byte-identical across five repos including Coach,
and this change should not touch Coach.

Add `test-overrides.mjs` at each repo root. Cases, at minimum:

- last activity removed on a day that also has `deload: true` → `deload`
  survives, `activities` key is gone;
- same with `note`;
- same with a slot key that is **not** in the current programme's `slots`
  (e.g. `{ cardio: "zone2" }` where current slots are `strength/run/bike/yoga`)
  → survives;
- last activity removed on a day with nothing else → the date key is removed;
- one of two activities removed → the other stays;
- unknown date or id → input returned unchanged (same object is fine).

The test must print `N passed, 0 failed` as its last line, like the other
gates.

`app.jsx` and `overrides.js` must end byte-identical across all four repos.

### 3. Deload copy says −40%; the engine does one set fewer — Joonatan and Juha

Decided by John on 28 Sep 2026: **keep the engine**, correct the words. The
engine subtracts one set per exercise, minimum 1 (`engine.js` `mapTask`), which
is −25% on 4-set and −33% on 3-set exercises.

Change these compiled-program and view texts only:

| repo | file | line (approx) | now |
|---|---|---|---|
| Joonatan | `src/core/program-joonatan.js` | 167 | `gentlerNote: "Deload week — cut sets ~40%, same intensity"` |
| Joonatan | `src/core/program-joonatan.js` | 10 (comment) | `trimming volume ~40%` |
| Joonatan | `src/config.jsx` | 113 | "The switch in Settings trims volume by roughly 40%…" |
| Juha | `src/core/program-juha.js` | 476 | `gentlerNote: "Deload week — cut sets ~40%, same intensity"` |

New wording:

- `gentlerNote`: `"Deload week — one set fewer per exercise (about −25 to −33%), same weights"`
- comment: `trimming one set per exercise (−25 to −33%)`
- Joonatan `config.jsx`: the Settings switch no longer exists (the deload is
  the week toggle in the Calendar, decided earlier). Replace the first
  sentence with: "The deload toggle on the Calendar week removes one set per
  exercise — about a quarter to a third of the volume — while keeping the
  weight the same." Keep the second sentence.

Do **not** change `engine.js` or any number.

Note for John, not for this session: the live programmes in Supabase
(`joonatan-2026-09`, `juha-2026-09-23`) still carry the old `gentlerNote`.
Those are corrected from chat by publishing new forward-only versions after
this merges.

## Out of scope

- The `wearable-sync` edge function (sleep window, minute flooring) — done
  from chat, needs Supabase.
- Polar reconnection — John, from Settings.
- Anything in `engine.js`, `program-schema.js`, `wearables.js`,
  `program-view.jsx`.
- Fixing whatever `verify-otp.mjs` reports.
- Bumping `APP_VERSION` beyond a patch: use `5.5.2-beta1` in all four.

## Gates (every client repo)

```
npm install
node verify-program-delivery.mjs   # MUST end "0 failed"
node test-history-versions.mjs     # MUST end "0 failed"
node test-wearable-scope.mjs       # MUST end "0 failed"
node test-program-view.mjs         # MUST end "0 failed"
node test-overrides.mjs            # MUST end "0 failed"  (new)
node verify-otp.mjs                # report the result, not a gate
npm run build                      # only after the gates above pass
```

Plus: md5 of `src/app.jsx`, `src/core/overrides.js`, `engine.js`,
`program-schema.js`, `wearables.js`, `program-view.jsx` — identical across the
four repos; `engine.js` unchanged from the snapshot.

## Done means

Four PRs (one per client repo) on `step9/phase0-housekeeping`, one Coach PR
containing only `briefs/reports/step9-phase0-housekeeping-report.md`.
