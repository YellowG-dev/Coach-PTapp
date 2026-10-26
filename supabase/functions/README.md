# Supabase Edge Functions — source copies

Project `qpkdqyazdzhoohowkouy`. Until 26 Oct 2026 these sources existed only in
Supabase. They are copied here so the code is reviewable and survives the
project. **Supabase is still where they run**; this folder is a record, and a
change here does nothing until it is deployed.

| Function | Deployed version | `verify_jwt` | Copy |
|---|---|---|---|
| `wearable-sync` | **8** (26 Oct 2026) | true | verbatim |
| `wearable-connect` | 1 | true | verbatim |
| `wearable-callback` | 2 | false | verbatim |
| `wearable-cron` | 1 | false | verbatim **except the gate key, redacted** |
| `wearable-probe` | 3 | — | not copied; its table is gone, deletion candidate |

- Each function deploys its own `shared.ts` copy. The copies differ only in a
  comment line ("keep the copies identical" vs "keep the three copies identical").
- `wearable-sync` history: v7 (24 Oct) asks Oura `workout` and `daily_activity`
  to `end + 2 days` (Oura's end date is exclusive). v8 (26 Oct) adds Polar sport
  ids 9 → `nordicWalking`, 11 → `walking`, 24 → `crossCountrySkiing`, each
  matched against the Oura session with the same start minute.
- `wearable-cron` must never be deployed from this copy: its key is a
  placeholder. The real key lives in the deployed function and in the body of
  the pg_cron job `wearable-nightly-sync` (`0 6,15 * * *` UTC).
- Secrets used (names only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`, `STATE_SIGNING_KEY`, `OURA_CLIENT_ID/SECRET`,
  `POLAR_CLIENT_ID/SECRET`, optional `WEARABLE_RETURN_URL`.

**Rule when changing one:** fetch the deployed source first, change that, deploy,
then commit the deployed bytes here in the same pass — never the other way round.
