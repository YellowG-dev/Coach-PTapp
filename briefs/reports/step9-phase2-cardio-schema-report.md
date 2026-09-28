# Step 9 · Phase 2 — repeatable cardio: report

## Result

Partly done. Items 1–3 done and pushed in all four client repos, all gates
`0 failed`, not merged. Item 4 (Coach runs the client validator before
publishing) stopped before writing any code — see **Open** below.

## Changes

### Henna-PTapp ([PR #8](https://github.com/YellowG-dev/Henna-PTapp/pull/8)), Joonatan-PTapp ([PR #7](https://github.com/YellowG-dev/Joonatan-PTapp/pull/7)), Ville-PTapp ([PR #7](https://github.com/YellowG-dev/Ville-PTapp/pull/7)), Juha-PTapp ([PR #7](https://github.com/YellowG-dev/Juha-PTapp/pull/7))

Identical diff in all four:

- `src/core/program-schema.js` — additive `hrZones`, `cardioTypes`, and a new
  `blocks.<slot>.<key>.cardio` shape, added to `OPTIONAL_KEYS` with validator
  rules per the brief (errors: bad zone range, duplicate/reserved ids, a
  `cardioTypes[].slot` not in `slots`, non-positive cardio numbers, malformed
  `pace`, a `zoneAvg`/`zoneMax` not in `hrZones`, a `durationTaskId` not in
  that block's own `exercises`; warnings: a sport under two cardio types,
  `cardio` on a `strength`-slot block). `SCHEMA_VERSION` stays `2`.
- `src/core/cardio.js` (new) — `isRealSession` moved here unchanged;
  `recordedWorkouts`, `dedupe`, `matchDay`, `zoneBpm`, `pace`,
  `weeklyCardioMinutes`, `activityFromWorkout` added. Pure: no React, no
  Supabase, no uninjected `Date.now()`.
- `src/core/wearables.js` — `isRealSession` replaced by
  `import { isRealSession } from "./cardio.js"; export { isRealSession };`.
  Behaviour unchanged — proven by `test-wearable-scope.mjs`, which needed one
  line added to its own stub-path rewriting (its temp file lives at the repo
  root, so the new relative import needed the same treatment the two existing
  ones already got).
- `test-cardio.mjs` (new) — 46 checks: the validator additions; `isRealSession`
  filtering; `dedupe` on an overlapping and a non-overlapping pair; `matchDay`
  against a planned slot vs. an extra, and against a dismissed/already-confirmed
  workout; `zoneBpm` with and without max HR; a legacy `{id,name}` activity
  counting 0; a planned block with no `durationTaskId` counting 0; the weekly
  total across a programme-version boundary; `activityFromWorkout`.
- `bundle.js` — rebuilt.

`app.jsx` and `engine.js` are untouched, per the brief's Out of scope.

### Coach-PTapp (this PR)

- `briefs/reports/step9-phase2-cardio-schema-report.md` (this file) only.
  Item 4 (copying `program-schema.js` into Coach, wiring `validate()` into
  `publish.js preflight`, extending `verify-publish.mjs`) is **not** in this
  PR — see Open.

## Gates

Identical last line in all four client repos:

| gate | Henna | Joonatan | Ville | Juha |
|---|---|---|---|---|
| `verify-program-delivery.mjs` | 95 passed, 0 failed | 95 passed, 0 failed | 95 passed, 0 failed | 95 passed, 0 failed |
| `test-history-versions.mjs` | 29 passed, 0 failed | 29 passed, 0 failed | 29 passed, 0 failed | 29 passed, 0 failed |
| `test-wearable-scope.mjs` | 10 passed, 0 failed | 10 passed, 0 failed | 10 passed, 0 failed | 10 passed, 0 failed |
| `test-program-view.mjs` | 46 passed, 0 failed | 46 passed, 0 failed | 46 passed, 0 failed | 46 passed, 0 failed |
| `test-overrides.mjs` | 7 passed, 0 failed | 7 passed, 0 failed | 7 passed, 0 failed | 7 passed, 0 failed |
| `test-cardio.mjs` (new) | 46 passed, 0 failed | 46 passed, 0 failed | 46 passed, 0 failed | 46 passed, 0 failed |
| `npm run build` | ok | ok | ok | ok |

Coach: no gate run beyond confirming the existing `verify-publish.mjs`
(`26/26 checks passed`, unmodified) and `validate()` against `fixtures/programs.json`
(see Open) — item 4's own gates were never started.

## Hashes

Byte-identical across Henna, Joonatan, Ville, Juha:

| file | md5 |
|---|---|
| `src/core/program-schema.js` | `e67329ea75002a56204d6d4ae435e201` |
| `src/core/cardio.js` | `f335f6187e8eba029f67d6c3ca84dde4` |
| `test-cardio.mjs` | `4c04db39428cf2d3166c25f22da35064` |
| `src/app.jsx` (unchanged from Phase 0) | `3a82c56df84a4ae60e1b28cf496b1ef4` |
| `src/core/engine.js` (unchanged) | `a1ab926aa93e75277ae660ca616e6d1c` |

`program-schema.js` is **not yet** copied into Coach-PTapp (item 4 stopped),
so the "byte-identical across the four client repos and Coach" requirement is
not met yet — only across the four clients.

## Open

**Item 4 stopped: Coach's published programme definitions fail the client
validator today, before any change in this phase.**

Fact-checked against `Coach-PTapp/fixtures/programs.json` (the same data the
live `programs` table holds, per the brief's own framing):

```
juha-2026-09      → missing required key: slotMeta, missing required key: slotOptions
henna-2026-09     → missing required key: slotMeta, missing required key: slotOptions
joonatan-2026-09  → missing required key: slotMeta, missing required key: slotOptions
```

All three of Coach's onboarded clients' published definitions lack `slotMeta`
and `slotOptions`, both required by `program-schema.js` regardless of any
change in this phase. By contrast, each client's own **compiled** programme
(`src/core/program-<client>.js`) already passes `validate()` today — that
assertion is part of the existing `verify-program-delivery.mjs` gate, which
stayed green throughout. The gap is specifically between what has been
*published to Supabase* and what the client's own contract requires — exactly
the class of problem the brief's Facts section names: *"Coach publishes
without running the client validator... A Coach-published definition can
therefore pass Coach and be rejected by the client — the same failure as
Ville's 15 errors in Step 8."*

The brief's own instruction for this exact situation: *"Coach: extend
verify-publish.mjs — a definition with a schema error is blocked; every
definition in fixtures/programs.json passes (if one does not, stop and
report — do not edit the fixture to make it pass)."*

Followed literally: not every fixture passes, so item 4 stopped rather than
proceeding. Concretely, wiring `validate()` into `publish.js preflight` as
written would **break an existing, currently-green gate**:
`verify-publish.mjs`'s check *"republishing the current program unchanged, at
a future date, passes"* republishes the live Juha definition unchanged and
asserts `preflight(...).ok === true`. With `validate()` wired in, that
definition would now be rejected — Coach would stop being able to republish
Juha's, Henna's, or Joonatan's programme at all, for a reason (`slotMeta`
missing) that has nothing to do with the change being published.

**Question for John:** how do you want this closed? Concretely:

1. Publish corrected definitions for Juha, Henna and Joonatan (adding
   `slotMeta`/`slotOptions`, sourced from each client's own compiled
   `program-<client>.js`, which already has them) from chat first, then a
   follow-up session wires `validate()` into `preflight` once every current
   fixture actually passes; or
2. Wire `validate()` in now but only as a warning (never blocking) until the
   live data is corrected, then tighten it to blocking in a follow-up; or
3. Something else.

Not picked here — this is exactly the "decision the brief does not cover"
case the briefs process asks to stop and report, not guess.

**Also open:** `overrides.dismissedWorkouts` and the wearable-confirmed
`activities[]` fields (`typeId`, `durationMin`, `distanceKm`, `hrAvg`, `hrMax`,
`source`, `workout`) are schema additions only in this phase, per the brief —
no existing client data uses them yet, and nothing writes them until Phase 5
(UI). `hrZones`/`cardioTypes` are likewise not yet published into any live
programme; per the brief, that is data work from chat after this code
deploys, not part of this session.
