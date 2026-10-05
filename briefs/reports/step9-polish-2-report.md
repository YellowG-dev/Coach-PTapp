# Step 9 · Polish, part 2 — report

## Result

**Done.** All five repos carry the full `step9-polish.md` scope plus the three
approved check updates. Every gate ends `0 failed` / all passed, including
`verify-render` run bundled. Both browser checks pass. One PR per repo, not
merged. Nothing was written to Supabase. `engine.js` is unchanged.

## Start point

All five branches were at the heads in the brief (Henna `5c34443`, Joonatan
`d9ac8ee`, Ville `0f71fa7`, Juha `ce74a12`, Coach `1fe80f1`), clean, with the
shared-file hashes in the brief. `main` was merged into the Coach branch first,
because it carries this brief (merge commit, no conflicts).

## Changes

**Clients (Henna, Joonatan, Ville, Juha):** no code change in this session.
Gates re-run; `npm run build` gives no diff.

**Coach:**
- `fixtures/programs.json`: the 6 rows from `programs-new-rows.json` appended
  unchanged. The first 5 rows are byte-identical and in their original order (11 rows).
- `verify-editor.mjs`, `verify-publish.mjs`, `verify-render.mjs`: the three
  approved updates, word for word from the brief.
- `verify-overview.mjs`: 7 new §3 checks. Yoga with a planned run and no yoga
  is flagged, with and without cardioTypes. Yoga on a planned yoga day is not
  flagged. Yoga on a strength-only day is flagged. Strength is unchanged. An
  unknown sport keeps the no-false-alarm fallback, and an unknown sport on a
  strength-only day is still flagged. Against the old `overview.js`, the two
  "yoga with a planned run" checks fail, so the tests catch the bug.
- `verify-validator.mjs`: every one of the 11 fixture rows validates with 0
  errors under the new `program-schema.js` (the "new rules vs all live
  versions" check). All 11 pass, so the new `durationTaskId` rule does not
  fail any live version.
- `src/core/data.js`: `deleteFutureVersion(id)` deletes from `programs` by `id`
  with `.gt("effective_from", <local today yyyy-mm-dd>)` in the query. It
  returns `ok:false` with a reason when no row was deleted (in force, past or
  gone). `canDeleteVersion(row)` is true only when `effective_from` is after
  today; it is false for `-infinity` or a malformed date. The header comment
  of `insertProgramVersion` ("the only write") is corrected.
- `src/app.jsx` (Coach's own, not the client file): Versions tab →
  `VersionsTable` gets a "Delete version" button on each row where
  `canDeleteVersion` is true. It opens an inline confirm naming the id and the
  date, and "Confirm" sends the delete. On success the dashboard reloads
  (`onPublished` → `reloadKey`), which is how the version list reloads.
- `verify-delete.mjs` (new): checks the guarded query chain, the
  error/no-row/no-client paths, and that `canDeleteVersion` is false for today
  and past dates and true for tomorrow. It also checks that the UI is wired
  through these two functions.
- `verify-browser.mjs`: its `data.js` stub gains `deleteFutureVersion` and
  `canDeleteVersion` exports, because `app.jsx` now imports them and the stub
  bundle would not build without them. No check changed.
- `briefs/data/polish/programs-delete-policy.sql` (new, not run): uses
  `ALTER POLICY programs_delete … USING (owner_id = auth.uid() AND
  effective_from > current_date)`, inside a guard that applies it only when
  the current `qual` is exactly `(owner_id = auth.uid())`. Otherwise it raises
  a NOTICE and changes nothing. It ends with a `pg_policies` select.
  `ALTER POLICY` keeps the policy's command and roles as they are.
- `bundle.js`, `styles.css` rebuilt. Versions stay as the first session set
  them: clients `5.8.1-beta1`, Coach `0.12.1`.

## Gates (last line)

Coach: `verify` ALL CHECKS PASSED · `verify-adherence` 36/36 · `verify-browser`
All browser checks passed · `verify-delete` 13 passed, 0 failed ·
`verify-editor` 64 passed, 0 failed · `verify-overview` 91 passed, 0 failed ·
`verify-progress` 40 passed, 0 failed · `verify-publish` 31/31 ·
`verify-recovery` 12 passed, 0 failed · `verify-validator` ALL CHECKS PASSED ·
`verify-render` (bundled as the brief says) All render checks passed ·
`npm run build` ok.

Before the new tests, with only the fixture and the three approved updates,
the results matched the brief's numbers exactly (editor 64/0, publish 31/31,
overview 84/0, render all passed). The overview count then rose 84 → 91 from
the new checks alone. No other check changed result.

Clients, each of the four: `verify-program-delivery` 95/0 ·
`test-history-versions` 29/0 · `test-wearable-scope` 10/0 · `test-cardio`
101/0 · `test-cardio-client` 32/0 · `test-overrides` 7/0 · `test-program-view`
46/0 · `verify-otp` 9/0 · `verify-start` 5/0 · `verify-time` 32/0 ·
`verify-wearables` 19/0 · `verify-theme`, `verify-train` ALL CHECKS PASSED.
`test-categories` gives Henna 28/0, Joonatan 28/0, Ville 34/0, Juha 36/0.
`test-program-view-equivalence` gives 198/0, 170/0, 37/0, 254/0.
`npm run build` ok.

## Browser checks (headless Chromium, `briefs/reports/step9-polish/`)

- **Client, Henna build: 15 passed, 0 failed.** Mocked Supabase, served by a
  small node static server. A watch ride today with no slot change is
  confirmed, which writes one `source:"wearable"` activity and no slot keys.
  After that there is no "Rearranged" badge, the subtitle reads "From your
  watch", and the Calendar border for today is solid. Tomorrow's moved slot
  gives a dashed border. A moved slot today gives the badge and a dashed
  border. Mixed extras read "From Calendar and your watch", with no badge.
  Against the old `main` bundle the same script fails exactly the 6 P1/P2
  checks, so it detects the change.
- **Coach: 13 passed, 0 failed.** This runs the real `app.jsx` and the real
  `deleteFutureVersion`; only `loadAll` and the Supabase client are stubbed,
  and the client records the query chain it receives. The Henna rows add mocks
  for today, tomorrow and 2 Nov. "Delete version" appears on tomorrow and on
  2 Nov only, not on the in-force version (today) or on past ones. The confirm
  names `henna-2026-11` and `2026-11-02`, and nothing is sent before Confirm.
  Confirm sends `from programs · delete · eq id · gt effective_from 2026-10-05 ·
  select`, the list reloads, and the row is gone.
- Screenshots, both scripts and their output are saved alongside.

## Hashes

- `app.jsx` (4 clients): md5 `53249643`, sha256 `6a6bdc3e0964…`.
- `test-cardio.mjs` `664af66f`, `test-cardio-client.mjs` `3b8d71df` (4 clients).
- `program-schema.js` `3e534c15`, `cardio.js` `35c462ba`, `engine.js`
  `c3eb98c2` (all 5; `engine.js` unchanged).

## Open

1. **Where "Delete version" lives.** The brief says "Editor UI". The editor
   (Programme tab) only ever shows the single version it drafts from, which is
   the one in force tomorrow, so a version further out never appears there. The
   per-version list is the Versions tab, so the action is there, next to the
   "in force" tag. If you want it in the Programme tab as well, that is a small
   follow-up.
2. **Date basis.** The app compares `effective_from` with the coach's
   *local* date, while the SQL policy uses the database's `current_date`
   (UTC). In Finland local time is never behind UTC, so the app is always at
   least as strict as the policy. Just after local midnight it may refuse a
   version the policy would still allow, never the reverse.
3. **Policy SQL.** The guard assumes `pg_policies.qual` reads exactly
   `(owner_id = auth.uid())`. That is the form the brief records from 3 Oct;
   I could not check it from the session. If it differs, the script changes
   nothing and prints the current text.
