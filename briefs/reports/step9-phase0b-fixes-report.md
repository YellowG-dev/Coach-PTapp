# Step 9 · Phase 0b — report

## Result
Partly done — all three fixes are implemented and built in five repos. One listed gate, `verify-wearables.mjs`, cannot pass: it already crashed on `main` before this change (see Open). Not merged.

## Changes
Clients (Henna, Joonatan, Ville, Juha — identical edits):
- `src/core/cardio.js` — new `isRealSession` rule; `OURA_EXCLUDED_SPORTS` and `OURA_WALK_MIN_MINUTES` constants (John, 29 Sep 2026). `wearables.js` unchanged; it still re-exports.
- `src/app.jsx` — Calendar weekday header now `flex gap-1.5` + `w-7 shrink-0` spacer only when `PROGRAM.showDeloadToggle` + `grid grid-cols-7 flex-1`; Backup section wrapped in `{!authUser && (…)}` (same `authUser` the sign-in block uses). `exportBackup`/`importBackup` kept.
- `test-cardio.mjs` — the "oura confirmed is not real" check replaced by one check per table row (incl. walking 29 / 30 min / no duration); the `recordedWorkouts` check updated to the new rule.
- `verify-train.mjs` — chosen for the Calendar structure check because it already reads `app.jsx` as text in every client repo. It has no renderer, so the check is structural (text), not a rendered layout test. Also checks the Backup guard. Toggle-off is covered by asserting the spacer is conditional on `showDeloadToggle`.
- `src/core/program-<client>.js` — `APP_VERSION` 5.5.3-beta1. `bundle.js` rebuilt (`styles.css` unchanged).

Coach:
- `src/core/cardio.js` — added, byte-identical to the clients'.
- `src/core/recovery.js` — own `isRealSession` copy removed; imports it from `cardio.js` (and re-exports it so `verify-recovery.mjs` keeps its import). Header comment rewritten.
- `verify-recovery.mjs` — old-rule checks still held under the new rule (no edit needed); added: confirmed 49-min run counts, confirmed 16-min housework does not.
- `src/config.jsx` — `COACH_VERSION` 0.5.4. `bundle.js`/`styles.css` rebuilt.

## Gates (last line, per repo; Henna = Joonatan = Ville = Juha)
- verify-program-delivery: 95 passed, 0 failed
- test-history-versions: 29 passed, 0 failed
- test-wearable-scope: 10 passed, 0 failed
- test-program-view: 46 passed, 0 failed
- test-overrides: 7 passed, 0 failed
- test-cardio: 63 passed, 0 failed
- verify-otp: 9 passed, 0 failed
- verify-start: 5 passed, 0 failed · verify-theme: ALL CHECKS PASSED · verify-time: 32 passed, 0 failed · verify-train: ALL CHECKS PASSED
- verify-wearables: **crashes (ERR_MODULE_NOT_FOUND) — pre-existing, see Open**
- `npm run build`: done, all four.

Coach: verify ALL CHECKS PASSED · verify-adherence 36/36 · verify-publish 31/31 · verify-recovery 12 passed, 0 failed · verify-validator ALL CHECKS PASSED · verify-render (bundled) "All render checks passed" · build done.

## Hashes (first 16 hex)
- `app.jsx` ×4 clients: d2221ad38289dbe4
- `cardio.js` ×4 clients + Coach: be57da0a58677d8c
- `test-cardio.mjs` ×4: 787fa5f7a421f680
- `wearables.js` ×4: 3e5bb7798b81eaea
- `dates.js` ba1b0bc93c828861 · `engine.js` 79c74cde0233cee4 · `program-schema.js` e74ab8413e487b98 — identical Henna vs Coach (all five not each compared by me beyond Henna/Coach).

## Open
1. **`verify-wearables.mjs` is broken on `main`, independent of this change.** It copies `wearables.js` to a temp file at the repo root and imports it; since Phase 2, `wearables.js` imports `./cardio.js`, which does not resolve from there. Reproduced with my changes stashed. In a scratch copy with the import redirected to `./src/core/cardio.js`, 18 of 19 checks pass; the one failure is line 42, `isRealSession({vendor:"oura", source:"confirmed"})` expected `false` — it encodes the old rule and is wrong by design now (a sport-less confirmed row counts under "any other sport"). Proposed patch (not applied, file not listed in the brief): redirect the `./cardio.js` import in the strip step, and change line 42 to use `sport: "houseWork"`. Needs a decision.
2. Brief's quoted hashes for `dates.js` / `engine.js` / `program-schema.js` (`c770b93e…`, `a1ab926a…`, `e67329ea…`) do not match the repos (`ba1b0bc9…`, `79c74cde…`, `e74ab841…`). The files are byte-identical between Henna and Coach, which is the claim that matters; brief hashes look stale.
3. Coach `main` is at `244c384`, not the brief's `e8d0bd2` (later briefs merged, no code change seen). No open PRs in any of the five repos, so no conflict on `app.jsx`.
4. `verify-train.mjs` carries the new Calendar/Backup checks; it is text-based, so it does not prove the header aligns visually. A visual check on a phone after deploy is worthwhile.
5. No confirmed Oura workout without a `sport` field is covered by the brief; it counts as "any other sport".
