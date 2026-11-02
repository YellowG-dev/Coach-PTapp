# Step 9 · Polish — report

## Result

**Partly done — stopped on a stop rule.** Clients (§1, §2, §6) are finished and
green. Coach stopped after the fixture append changed two existing gates. No PRs
opened; branches pushed for review.

## What stopped it

Appending the 6 rows from `briefs/data/polish/programs-new-rows.json` to
`fixtures/programs.json` (old 5 rows byte-identical) changed two existing gates:

- `verify-editor`: 63 passed, 1 failed — `startDraft picks the version in force
  on the date` expects `juha-2026-09-23` on 2026-10-01; the new row
  `juha-2026-10` (effective 2026-10-01) is now in force.
- `verify-publish`: 30/31 — `republishing the CURRENT live Juha version at a
  future date passes` expects `inForce.id` `juha-2026-09-23`; got `juha-2026-10`.

With the fixture reverted both return to 64/0 and 31/31, so the cause is the
fixture append, not the code edits. The brief says not to edit expectations, so
the fixture append is **not committed**. The brief's premise ("rows effective 29
Sep or later should not change any existing result") does not hold for these two
checks, which use dates on or after 1 Oct.

## Changes

Clients (Henna, Joonatan, Ville, Juha; identical except the version file):
- `src/app.jsx` — Rearranged badge and Calendar dashed border use
  `plannedChanged`; Extra Activity subtitle uses `extrasSubtitle` (P1, P2).
- `src/core/cardio.js` — new pure helpers `plannedChanged`, `extrasSubtitle`.
- `src/core/program-schema.js` — `durationTaskId` must name a `type: "number"`
  task, else error (P3).
- `src/core/program-<client>.js` — `APP_VERSION` 5.8.1-beta1.
- `test-cardio.mjs`, `test-cardio-client.mjs` — new checks per the brief.
  One existing check, `block.cardio accepts a well-formed target`, used a
  `durationTaskId` task with no `type`; the new rule correctly rejects that, so I
  gave the test task `type: "number"`. Expectation unchanged, data corrected.
- `bundle.js`, `styles.css` rebuilt.

Coach (work in progress, not complete):
- `src/core/cardio.js`, `src/core/program-schema.js` — copies of the client files.
- `src/core/overview.js` — `matches(w)` uses `nonCardioSlotFor` (§3).
- `COACH_VERSION` and `?v=` → 0.12.1; bundle rebuilt.

**Not done:** Coach tests for §3 (`verify-overview`), fixture append and
all-rows validator check (§4), `deleteFutureVersion`, the "Delete version" UI and
`programs-delete-policy.sql` (§5), browser checks, PRs.

## Gates (last line)

Clients, all four: `verify-program-delivery` 95 passed, 0 failed ·
`test-history-versions` 29/0 · `test-wearable-scope` 10/0 · `test-cardio` 101/0 ·
`test-cardio-client` 32/0 · `test-overrides` 7/0 · `test-program-view` 46/0 ·
`verify-otp` 9/0 · `verify-start` 5/0 · `verify-time` 32/0 · `verify-wearables`
19/0 · `verify-theme` and `verify-train` ALL CHECKS PASSED · `test-categories`
and `test-program-view-equivalence` 0 failed in each. `npm run build` OK.

Coach with the fixture reverted: all existing gates as before (`verify-editor`
64/0, `verify-publish` 31/31, others unchanged). `verify-render` fails on a
clean `main` too (Node cannot load `.jsx`); it is not a working gate here.

## Hashes

- `app.jsx` sha256 `6a6bdc3e0964…` in all 4 clients (was `64101b07…`).
- `test-cardio.mjs` md5 `664af66f`, `test-cardio-client.mjs` `3b8d71df`, all 4.
- `program-schema.js` `3e534c15`, `cardio.js` `35c462ba` in all 5 repos.
- `engine.js` `c3eb98c2` in all 5, unchanged.

## Open — needs a decision

1. How to handle the two gates. Options: update the two expectations to the
   new in-force row (`juha-2026-10`), or change those tests' dates. Either edits
   expectations, which the brief forbids without your call.
2. Heads-up: `verify-publish` got `juha-2026-10` in force with a 28 Sep "today"
   in the test; I did not investigate why, since the rule is to stop.
