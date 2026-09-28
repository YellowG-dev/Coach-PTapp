# Step 9 · Phase 2 item 4 — Coach runs the client validator — report

**Result:** done, from chat, 28 Sep 2026. Coach 0.5.3.

## Why the cloud session stopped, and what was actually wrong

The session found that Coach's programme definitions fail `validate()` and
stopped, as the brief required. The finding was about the **test fixture**,
not the live data:

- `fixtures/programs.json` was a pre-Step-8 snapshot: 3 rows, no `slotMeta` /
  `slotOptions` → 4 errors each.
- The **live** `programs` table (5 rows) passes the new `validate()` with
  0 errors and 0 warnings on every row — checked directly against Supabase.

## Changes

- `fixtures/programs.json` — refreshed from the live table (5 rows: Juha ×2,
  Henna, Joonatan, Ville). Same row shape as before.
- `src/core/program-schema.js` — new; byte-identical to the Phase 2 client
  copy (md5 `e67329ea…`).
- `src/core/publish.js` — `preflight` runs `validate()`: errors block
  ("The client app would reject this: …"), warnings are shown. Stale header
  comment corrected (publishing has changed the client's app since Step 8).
- `src/app.jsx` — the Publisher said "It does not change {name}'s app". Wrong
  since Step 8, and the one sentence that made publishing look harmless.
  Now says it does, from the effective date.
- `verify-publish.mjs` — scenarios frozen at 20 Sep now see only rows in force
  by 20 Sep (the refreshed fixture contains Juha's 23 Sep version, which made
  two old checks fail for a date reason, not a code reason). Five new checks:
  every live programme passes; a client-rejectable definition blocks; an
  unknown cardio zone blocks; republishing the current Juha version passes;
  client warnings show without blocking.
- `verify-render.mjs` — needle follows the corrected copy.
- `COACH_VERSION` 0.5.2 → 0.5.3; `bundle.js` rebuilt.

## Gates

| gate | result |
|---|---|
| `verify.mjs` | ALL CHECKS PASSED |
| `verify-adherence.mjs` | 36/36 |
| `verify-publish.mjs` | 31/31 (was 26) |
| `verify-recovery.mjs` | 11 passed, 0 failed |
| `verify-validator.mjs` | ALL CHECKS PASSED |
| `verify-render.mjs` (bundled, as its header says) | all passed |

Mutation check: with the `validate()` call stubbed out, 3 of the new checks
fail (28/31). The tests catch the missing wiring.

## Hashes

`engine.js` `a1ab926a…` (unchanged, = clients). `program-schema.js`
`e67329ea…` (= Phase 2 client PRs).

## Open

- Deploy Coach **after** the four Phase 2 client PRs, so the validator Coach
  enforces is the one the clients run.
