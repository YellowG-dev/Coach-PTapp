# Step 9 · Phase 0b — three fixes John found in use

Status: **READY** · written 29 Sep 2026 against `main` (clients 5.5.2-beta1 at
Henna `ca2b738`, Joonatan `23e8a43`, Juha `bea0180`, Ville `c8401ea`; Coach
0.5.3 at `e8d0bd2`). Branch: the session's own (see README).

This session **edits `src/app.jsx`** in the four client repos — confirm no
other open PR touches it (CLAUDE.md rule 3).

It can run in parallel with Phase 3a (Coach editor). They touch different
Coach files (0b: `recovery.js`, new `cardio.js`, `COACH_VERSION`; 3a: new
editor files, `app.jsx` wiring), so the only expected conflict is
`COACH_VERSION` and `bundle.js` — rebuild after rebasing.

## Repos

`Henna-PTapp`, `Joonatan-PTapp`, `Ville-PTapp`, `Juha-PTapp`, `Coach-PTapp`.

## 1. Which Oura workouts count — rule changed by John, 29 Sep 2026

**Why:** Ville's run on 28 Sep was auto-detected by Oura and then accepted by
him (`source = "confirmed"`), so the current rule dropped it. John wants real
sports that Oura detects to count, but not housework, yardwork or short walks.

**Rule** (`isRealSession(w)`):

| vendor / source | counts? |
|---|---|
| not Oura (Polar) | yes (unchanged) |
| Oura `workout_heart_rate`, `manual` — client started or entered it | yes (unchanged) |
| Oura `autodetected` — not yet accepted by the client | no (unchanged) |
| Oura `confirmed`, sport `houseWork`, `yardwork`, `stretching`, `other` | **no** |
| Oura `confirmed`, sport `walking`, `duration_minutes` **≥ 30** | **yes** |
| Oura `confirmed`, sport `walking`, under 30 min or no duration | **no** |
| Oura `confirmed`, any other sport (running, strengthTraining, yoga, cycling, hiking, tennis, HIIT, swimming, paddleSports, …) | **yes** |

Put the excluded sports and the 30-minute walk threshold in named constants at
the top of the function's file, with a one-line comment that John set them on
29 Sep 2026.

**Where** — one rule, not two copies:

- Clients: `src/core/cardio.js` (`isRealSession` lives there since Phase 2;
  `wearables.js` re-exports it). Change it there only.
- Coach: `src/core/recovery.js` has its **own copy** (line ~15). Replace it by
  copying `src/core/cardio.js` into Coach **byte-identical** to the clients
  and importing `isRealSession` from it. `cardio.js` imports `dates.js`,
  `engine.js`, `program-schema.js` — all three are already byte-identical in
  Coach (verified: `dates.js` `c770b93e…`, `engine.js` `a1ab926a…`,
  `program-schema.js` `e67329ea…`). Update the comment block at the top of
  `recovery.js` to describe the new rule.

**Tests:**
- `test-cardio.mjs` (clients): the existing check "oura confirmed is not real"
  becomes wrong by design — replace it with one check per table row above,
  including 29 and 30 minutes for walking and a walk with no duration.
- Coach `verify-recovery.mjs`: must still end `0 failed`; if a check asserted
  the old rule, update it to the new rule and say so in the report. Add one
  check that a confirmed 49-min run counts and a confirmed 16-min housework
  does not.

## 2. Calendar weekday header is misaligned

**Cause (verified in `src/app.jsx` ~line 2128):** the header is a plain
`grid grid-cols-7` across the full width, but every week row is
`flex` = a `w-7` **D** (deload) button + `gap-1.5` + a `grid grid-cols-7
flex-1`. All five live programmes have `showDeloadToggle: true`, so the header
columns are wider than the day columns and start further left.

**Fix:** give the header the same structure as a week row — `flex gap-1.5`,
a `w-7 shrink-0` empty spacer **only when `PROGRAM.showDeloadToggle`**, then
the `grid grid-cols-7 flex-1` of weekday labels. No other layout change.

**Test:** in the client repo's existing render/verify tooling, assert the
header and a week row have the same column structure with the toggle on and
off (e.g. `verify-start.mjs` or a small addition to an existing verify script
— pick the one that already renders the Calendar and say which in the
report).

## 3. Backup box in Settings — hide when signed in

**Decided by John, 29 Sep 2026.** A signed-in client's log, overrides and
settings sync to the cloud, and "Restore from above" (`importBackup`, ~line
876) overwrites the cloud copy with whatever is pasted — a real risk with an
old backup. Signed-out use must still work fully offline (CLAUDE.md), so the
box stays for signed-out users.

**Fix:** render the Backup section (~line 1184) only when there is **no**
signed-in user (use the same auth state the Settings sign-in block already
uses). Signed-out copy stays as it is. Do not remove `exportBackup` /
`importBackup`.

## Out of scope

Anything else in Calendar or Settings. `engine.js`, `program-schema.js`.
Supabase. The Phase 3a editor.

## Version

Clients `APP_VERSION` → `5.5.3-beta1`. Coach `COACH_VERSION` → next patch
above whatever `main` has when you start (0.5.4 if 3a has not merged).

## Gates

Clients, each repo:
```
npm install
node verify-program-delivery.mjs   # 0 failed
node test-history-versions.mjs     # 0 failed
node test-wearable-scope.mjs       # 0 failed
node test-program-view.mjs         # 0 failed
node test-overrides.mjs            # 0 failed
node test-cardio.mjs               # 0 failed
node verify-otp.mjs                # 0 failed
node verify-start.mjs; node verify-theme.mjs; node verify-time.mjs
node verify-train.mjs; node verify-wearables.mjs     # all pass
npm run build
```
Coach: `verify.mjs`, `verify-adherence.mjs`, `verify-publish.mjs`,
`verify-recovery.mjs`, `verify-validator.mjs`, `verify-render.mjs` (bundled
as its header says), then `npm run build`.

Byte-identical: `app.jsx`, `cardio.js`, `test-cardio.mjs`, `wearables.js`
across the four clients; `cardio.js`, `engine.js`, `program-schema.js`,
`dates.js` across all five.

## Done means

Five PRs; report `briefs/reports/step9-phase0b-fixes-report.md` in the Coach
PR.
