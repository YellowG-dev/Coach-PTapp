# Step 9 · Phase 0 — housekeeping: report

## Result

Done. Four PRs opened (Henna, Joonatan, Ville, Juha), all gates `0 failed`, not merged.

## Changes

### Henna-PTapp ([PR #7](https://github.com/YellowG-dev/Henna-PTapp/pull/7))
- `package.json`, `package-lock.json` — added `jsdom` as a devDependency.
- `src/app.jsx` — `removeActivity` now calls `removeActivityOverride` instead of inlining the buggy delete.
- `src/core/overrides.js` (new) — pure `removeActivityOverride(overrides, key, id)`.
- `test-overrides.mjs` (new) — the six cases from the brief.
- `src/core/program-henna.js` — `APP_VERSION` → `5.5.2-beta1`.
- `bundle.js`, `styles.css` — rebuilt.

### Joonatan-PTapp ([PR #6](https://github.com/YellowG-dev/Joonatan-PTapp/pull/6))
- Same five changes as Henna, plus:
- `src/core/program-joonatan.js` — `gentlerNote` and header comment reworded to match the engine's actual one-set-fewer behavior.
- `src/config.jsx` — Settings copy rewritten: no more "the switch in Settings" (that control moved to the Calendar week toggle earlier), corrected percentage language.
- `APP_VERSION` → `5.5.2-beta1`.

### Ville-PTapp ([PR #6](https://github.com/YellowG-dev/Ville-PTapp/pull/6))
- Same as Henna (jsdom, overrides fix + test, version bump). No deload copy in scope for Ville.

### Juha-PTapp ([PR #6](https://github.com/YellowG-dev/Juha-PTapp/pull/6))
- Same as Henna, plus `src/core/program-juha.js` `gentlerNote` reworded (same text as Joonatan's).

### Coach-PTapp (this PR)
- `briefs/reports/step9-phase0-housekeeping-report.md` (this file) only.

## Gates

Identical last line in all four client repos:

| gate | Henna | Joonatan | Ville | Juha |
|---|---|---|---|---|
| `verify-program-delivery.mjs` | 95 passed, 0 failed | 95 passed, 0 failed | 95 passed, 0 failed | 95 passed, 0 failed |
| `test-history-versions.mjs` | 29 passed, 0 failed | 29 passed, 0 failed | 29 passed, 0 failed | 29 passed, 0 failed |
| `test-wearable-scope.mjs` | 10 passed, 0 failed | 10 passed, 0 failed | 10 passed, 0 failed | 10 passed, 0 failed |
| `test-program-view.mjs` | 46 passed, 0 failed | 46 passed, 0 failed | 46 passed, 0 failed | 46 passed, 0 failed |
| `test-overrides.mjs` (new) | 7 passed, 0 failed | 7 passed, 0 failed | 7 passed, 0 failed | 7 passed, 0 failed |
| `verify-otp.mjs` (informational) | 9 passed, 0 failed | 9 passed, 0 failed | 9 passed, 0 failed | 9 passed, 0 failed |
| `npm run build` | ok | ok | ok | ok |

`verify-otp.mjs` passed clean on first run in a fresh clone in all four repos — nothing to fix, contrary to the "nobody knows whether it passes" uncertainty in the brief.

## Hashes

Byte-identical across Henna, Joonatan, Ville, Juha:

| file | md5 |
|---|---|
| `src/app.jsx` | `3a82c56df84a4ae60e1b28cf496b1ef4` |
| `src/core/overrides.js` | `01479ae49fefffe4026e1e337dcf219a` |
| `src/core/engine.js` (unchanged from snapshot) | `a1ab926aa93e75277ae660ca616e6d1c` |
| `src/core/program-schema.js` (unchanged) | `eb061639c6d08ccb9a18d0542dbbbe44` |
| `src/core/wearables.js` (unchanged) | `01ed0257facbbe680cbf771a51c0f4da` |
| `src/core/program-view.jsx` (unchanged) | `1845c199a39a6ea3d3ba3b95255599ef` |

`APP_VERSION` is `5.5.2-beta1` in all four.

## Open

- **Branch name deviation.** The brief specifies `step9/phase0-housekeeping` in every repo. This cloud session is configured (outside the brief, at session setup) to push only to `claude/elegant-mayer-uujpgh` across all five repos, with an explicit instruction never to push elsewhere without permission. All five repos' work, including this report, is on `claude/elegant-mayer-uujpgh` instead. All four client-repo HEADs matched the brief's snapshot table exactly and no other open PR touched `app.jsx` in any of the five repos at the time this session started, so nothing else was riding on the brief's specific branch name — but the branch naming convention itself was not followed, and a human should decide whether that matters before merging.
- **Snapshot held exactly.** Before touching anything, HEAD and the four listed file hashes (`app.jsx`, `engine.js`, `program-schema.js`, `wearables.js`) were re-verified against the brief's table in all four repos — all matched, plus `program-view.jsx` (not in the brief's table but included in the final hash gate) also matched across all four. No drift, so all three scope items applied exactly as written.
- **No blockers hit.** No gate failed, the brief did not contradict the code anywhere, and there was no decision the brief left uncovered.
- **Not actioned (per Out of scope / brief instruction):** the `wearable-sync` edge function, Polar reconnection, any change to `engine.js`/`program-schema.js`/`wearables.js`/`program-view.jsx`, fixing anything `verify-otp.mjs` might have reported (it reported nothing to fix), and republishing the live Supabase programmes for Joonatan and Juha with the corrected `gentlerNote` — that is chat-side work needing Supabase access, which this session does not have.
