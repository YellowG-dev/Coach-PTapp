# Step 9 · Phase 1 — Polar mapping

Status: **BLOCKED on account data, not on code.** Runs from chat (needs
Supabase and the vendor tokens), not from a cloud session.
Last updated 29 Sep 2026.

## Findings, 29 Sep 2026 (verified by probe, raw responses in `wearable_probe`)

| account | grant | training sessions | sleeps / activity / recharge |
|---|---|---|---|
| Ville | `training_sessions:read` only | `200 {}` for 20–29 Sep and for 28 Sep alone | `403` — scope not granted |
| Juha | all four scopes | `200 {}` for 1–29 Sep | `200` but empty arrays |

- Request format is right: `from`/`to` as naive timestamps return 200.
- **New:** `training-sessions/list` rejects ranges over **90 days** (400).
- The legacy `/v3/exercises` also returns `[]` for Ville.
- Ville's 28 Sep training exists — on Oura: strength 07:18 (entered by hand,
  55 min) and a run 16:49 (49 min, auto-detected by Oura and then accepted by
  Ville, `source = confirmed`).
- Polar's v4 documentation: users must have a Polar Flow account, authorise
  the app, and **accept all mandatory consents** before data is served.

So the API is reachable and answers, but serves no data for either account.
Not yet known why. Candidates, in order of how cheap they are to rule out:

1. The session never reached Polar Flow (watch not synced to the Flow app).
2. Mandatory consents not accepted in the Polar account.
3. Ville's partial grant (he unticked three of four permissions).

## What John / Ville do

1. Ville: open the **Polar Flow** app, sync the watch, and check yesterday's
   run is visible in Flow.
2. Ville: in the PT app, Settings → reconnect Polar, and **leave all four
   permissions ticked**.
3. If Flow shows the run and the API is still empty: check the Polar account
   for pending consents.

## What chat does when data appears

1. Probe `training-sessions/list` (≤ 90-day window) and store the raw payload.
2. Map **only fields actually present** into `wearable_workouts`
   (`vendor='polar'`, `vendor_session_id`, `sport`, `started_at`, `day`,
   `duration_minutes`, `distance_km`, `hr_avg`, `hr_max`, `raw`).
3. Deploy into `wearable-sync`, re-sync, verify rows, then delete the
   temporary `wearable-probe` function and `wearable_probe` table.

## Done already, 29 Sep

`wearable-sync` v4: a successful Polar token refresh now clears a stale
`needs_reauth`. Juha's Polar had been marked needs-reauth although its token
refreshed fine, so the nightly job was skipping it. Tested: set to `error`,
ran the job, it came back `connected` with a fresh token.
