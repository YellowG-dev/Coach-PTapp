# Step 9 · Polish, part 2 — finish what `step9-polish` stopped on

Status: **READY.** Written 5 Oct 2026 after the first polish session stopped
on a stop rule (report: `briefs/reports/step9-polish-report.md` on branch
`claude/gallant-lamport-jlyali`). The stop was correct: the brief's claim that
no existing check used a date on or after 29 Sep was wrong. This brief gives
the approved fix and lists the rest of the work.
Branch: the session's own (see README).

## Start point — continue, do not redo

Every repo has a branch `claude/gallant-lamport-jlyali` from the first session.
Start each repo from that branch (fast-forward the session's branch to it).

| Repo | Branch head | State |
|---|---|---|
| Henna | `5c34443` | done (§1, §2, §6 of `step9-polish.md`) |
| Joonatan | `d9ac8ee` | done |
| Ville | `0f71fa7` | done |
| Juha | `ce74a12` | done |
| Coach | `1fe80f1` | partial: shared files, `overview.js` fix, 0.12.1 |

Chat checked on 5 Oct: `program-schema.js` `3e534c15`, `cardio.js`
`35c462ba`, `engine.js` `c3eb98c2` in all five; `app.jsx` `53249643` (md5),
`test-cardio.mjs` `664af66f`, `test-cardio-client.mjs` `3b8d71df` in all four
clients. Henna's `test-cardio` 101/0, `test-cardio-client` 32/0,
`verify-program-delivery` 95/0, `test-history-versions` 29/0.

**Client repos need no further code changes.** Re-run their gates only, and
open their PRs.

## Decision (John, 5 Oct 2026)

The fixture refresh is kept. The three Coach checks that assumed Juha's
September version is the newest are updated to the live versions. These are
the only expectation changes allowed.

## Coach work

### 1. Fixture append (`step9-polish.md` §4)

Append the 6 rows of `briefs/data/polish/programs-new-rows.json` to
`fixtures/programs.json`, unchanged, after the existing 5 (which stay
byte-identical and in order).

### 2. The three check updates (approved, verified by chat on 5 Oct)

**`verify-editor.mjs`**, check `startDraft picks the version in force on the
date`. Replace the line

```js
  assert.strictEqual(draftOf(ID.juha, "2026-10-01").baseId, "juha-2026-09-23");
```

with

```js
  assert.strictEqual(draftOf(ID.juha, "2026-09-28").baseId, "juha-2026-09-23");
  assert.strictEqual(draftOf(ID.juha, "2026-09-30").baseId, "juha-2026-09-29");
  assert.strictEqual(draftOf(ID.juha, "2026-10-01").baseId, "juha-2026-10");
```

**`verify-publish.mjs`**, check `republishing the CURRENT live Juha version at
a future date passes`. Replace its body's first and last lines so it uses the
current live version:

```js
  const cur = byId["juha-2026-10"].definition;
  const r = preflight({ ...base, existingRows: programRows, today: new Date(2026, 9, 5), text: JSON.stringify(cur) });
  assert.ok(r.ok, "blocked: " + r.blocking.join(" | "));
  assert.strictEqual(r.inForce.id, "juha-2026-10");
```

**`verify-render.mjs`** — the session missed this one, because it ran the
script without the bundling step its header describes. With the new fixture
it reports `2 render problem(s)`: "editor open missing: no-zones hint" for
Juha and Ville. Their live versions now have `hrZones`, so the hint is
correctly absent. Replace

```js
    if(p.id!==ID.joonatan && !k.includes("Zones need a heart-rate zone table")){console.log("    editor open missing: no-zones hint");bad++;}
```

with

```js
    // The hint shows only when the version the editor drafts from has no zone table.
    const mine=programs.filter(r=>r.assigned_to===p.id).sort((a,b)=>String(a.effective_from)<String(b.effective_from)?-1:1);
    const baseHasZones=Boolean(mine.length&&mine[mine.length-1].definition.hrZones);
    const hint=k.includes("Zones need a heart-rate zone table");
    if(hint===baseHasZones){console.log("    editor: no-zones hint "+(hint?"shown although the base version has zones":"missing although the base version has none"));bad++;}
```

Chat ran all three changes with the 11-row fixture on 5 Oct: `verify-editor`
64/0, `verify-publish` 31/31, `verify-render` all passed (and still passes on
the old 5-row fixture), `verify-adherence` 36/36, `verify-overview` 84/0,
`verify-progress` 40/0, `verify-validator` and `verify` ALL CHECKS PASSED,
`verify-browser` all passed.

**How to run `verify-render`** (it is a working gate; it needs bundling):

```
npx esbuild verify-render.mjs --bundle --loader:.jsx=jsx --platform=node \
  --format=esm --outfile=render.bundle.mjs --packages=external \
  && node render.bundle.mjs && rm render.bundle.mjs
```

### 3. Everything else the first session did not reach

From `step9-polish.md`, unchanged in substance:

- §3 tests in `verify-overview.mjs`: yoga on a day with a planned run and no
  yoga → flagged; yoga on a planned yoga day → not flagged; strength
  unchanged; an unknown sport keeps the no-false-alarm fallback.
- §4 all-rows check in `verify-validator.mjs`: every row in
  `fixtures/programs.json` validates with 0 errors under the new
  `program-schema.js`.
- §5 delete a not-yet-effective version: `deleteFutureVersion(id)` in
  `src/core/data.js` with the `effective_from` > today guard in the query;
  "Delete version" in the editor only for a future version, with a confirm;
  `briefs/data/polish/programs-delete-policy.sql` (guarded, ends with a
  `pg_policies` select). Tests as listed in `step9-polish.md`.
- Browser checks, saved to `briefs/reports/step9-polish/`: the client check
  (Henna build) and the Coach "Delete version" check.

### Answer to the report's question 2

`preflight` sets `inForce` to the **newest** of the person's rows, whatever
`today` is. That is intended: a new version must start after the newest
one, and it is validated against that one. It is not a scoring path. No
change.

## Gates

Every gate in every repo ends `0 failed` (or ALL / all passed), including
`verify-render` run as above, plus `npm run build`. Versions stay as the
first session set them: clients `5.8.1-beta1`, Coach `0.12.1`.

## Stop rules (beyond the README)

- Any check other than the three above changes result → stop and report.
- `engine.js` would need a change → stop.
- Any shared-file hash differs from the table above at start → stop.

## Done means

- One PR per repo (five), not merged.
- Report at `briefs/reports/step9-polish-2-report.md`: result, changes,
  gates (last line each), hashes, open items.

Chat verifies every branch, then John merges Henna → Joonatan → Ville → Juha
→ Coach and runs `programs-delete-policy.sql`; chat verifies the policy.
