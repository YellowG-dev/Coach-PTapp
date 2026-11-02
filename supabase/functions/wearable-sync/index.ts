// wearable-sync — fetches a date range from a connected vendor and upserts it.
//
// Callable two ways:
//   • by the app with the user's JWT   → { vendor, days? }
//   • by the callback, wearable-cron or a job with the service role key → { user_id, vendor, days? }
//
// Oura is mapped to typed columns. Polar training sessions are mapped from
// payloads actually observed (see the Polar section). Polar sleep, activity and
// recharge are not mapped yet — no account has granted and produced them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CORS, Vendor, VENDORS, admin, freshAccessToken, json, ANON_KEY, SUPABASE_URL, SERVICE_KEY } from "./shared.ts";

const OURA = "https://api.ouraring.com/v2/usercollection";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" minus n days, in plain calendar arithmetic (no time zone). */
function dayMinus(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDay(d);
}

async function ouraGet(path: string, token: string, start: string, end: string) {
  const rows: Record<string, unknown>[] = [];
  let next: string | null = null;
  do {
    const url = new URL(`${OURA}/${path}`);
    url.searchParams.set("start_date", start);
    url.searchParams.set("end_date", end);
    if (next) url.searchParams.set("next_token", next);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`oura ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as { data?: Record<string, unknown>[]; next_token?: string | null };
    if (Array.isArray(body.data)) rows.push(...body.data);
    next = body.next_token ?? null;
  } while (next);
  return rows;
}

async function syncOura(userId: string, token: string, start: string, end: string) {
  // Oura's `sleep` collection filters on when a sleep STARTED but labels it
  // with the day it ENDED. The night that ends on `start` began the evening
  // before, so a window starting on `start` never fetched it. Ask one day
  // earlier, then keep only records labelled inside the window — anything
  // labelled before `start` belongs to an earlier run.
  //
  // `workout` and `daily_activity` treat end_date as EXCLUSIVE (verified
  // 24 Oct 2026 against Juha's account: end 24 Oct returned nothing for 24 Oct,
  // end 25 Oct returned that day's HIIT and steps). With `end` = today, today's
  // sessions and steps only arrived the next day. Ask two days past `end`:
  // one for the exclusive end, one because `end` is a UTC date and Helsinki is
  // ahead of UTC. Future days simply return nothing.
  const endPlus = dayMinus(end, -2);
  const [sleepAll, readiness, activity, workouts] = await Promise.all([
    ouraGet("sleep", token, dayMinus(start, 1), end),
    ouraGet("daily_readiness", token, start, end),
    ouraGet("daily_activity", token, start, endPlus),
    ouraGet("workout", token, start, endPlus),
  ]);
  const sleep = sleepAll.filter((s) => typeof s.day === "string" && (s.day as string) >= start);

  const byDay: Record<string, Record<string, unknown>> = {};
  const day = (d: string) => (byDay[d] ??= { user_id: userId, vendor: "oura", day: d, raw: {} });

  // A night can hold several sleep periods; the main sleep is the one to report.
  const mainSleep: Record<string, Record<string, unknown>> = {};
  for (const s of sleep) {
    const d = s.day as string;
    if (!d) continue;
    const dur = Number(s.total_sleep_duration ?? 0);
    const prev = mainSleep[d];
    if (!prev || dur > Number(prev.total_sleep_duration ?? 0)) mainSleep[d] = s;
  }
  for (const [d, s] of Object.entries(mainSleep)) {
    const row = day(d);
    const secs = Number(s.total_sleep_duration ?? 0);
    // Floor, not round: 6 h 08 min 30 s reads 6h08, as Oura's own app shows it.
    if (secs > 0) row.sleep_minutes = Math.floor(secs / 60);
    if (s.average_hrv != null) row.hrv = Number(s.average_hrv);
    if (s.lowest_heart_rate != null) row.resting_hr = Number(s.lowest_heart_rate);
    (row.raw as Record<string, unknown>).sleep = s;
  }
  for (const r of readiness) {
    const d = r.day as string;
    if (!d) continue;
    const row = day(d);
    if (r.score != null) row.readiness = Number(r.score);
    (row.raw as Record<string, unknown>).readiness = r;
  }
  for (const a of activity) {
    const d = a.day as string;
    if (!d) continue;
    const row = day(d);
    if (a.steps != null) row.steps = Number(a.steps);
    (row.raw as Record<string, unknown>).activity = a;
  }

  const dayRows = Object.values(byDay);
  const workoutRows = workouts
    .filter((w) => w.id && w.start_datetime)
    .map((w) => {
      const started = new Date(w.start_datetime as string);
      const ended = w.end_datetime ? new Date(w.end_datetime as string) : null;
      const metres = w.distance != null ? Number(w.distance) : null;
      return {
        user_id: userId,
        vendor: "oura",
        vendor_session_id: String(w.id),
        sport: (w.activity as string) ?? null,
        // 'workout_heart_rate' and 'manual' are real sessions; 'confirmed' is
        // auto-detected daily activity (walking, housework) and is stored but
        // not shown as training.
        source: (w.source as string) ?? null,
        started_at: started.toISOString(),
        day: (w.day as string) ?? isoDay(started),
        duration_minutes: ended ? Math.round(((+ended - +started) / 60000) * 10) / 10 : null,
        distance_km: metres != null ? Math.round((metres / 1000) * 100) / 100 : null,
        // Oura's workout documents carry no average or maximum heart rate.
        hr_avg: null,
        hr_max: null,
        raw: w,
        fetched_at: new Date().toISOString(),
      };
    });

  const db = admin();
  if (dayRows.length) {
    const { error } = await db.from("wearable_days").upsert(dayRows, { onConflict: "user_id,vendor,day" });
    if (error) throw new Error(`day upsert failed: ${error.message}`);
  }
  if (workoutRows.length) {
    const { error } = await db.from("wearable_workouts")
      .upsert(workoutRows, { onConflict: "user_id,vendor,vendor_session_id" });
    if (error) throw new Error(`workout upsert failed: ${error.message}`);
  }
  return { days: dayRows.length, workouts: workoutRows.length };
}

/* --------------------------------- Polar ---------------------------------- */
// Mapped 29 Sep 2026 from Ville's real v4 payloads (42 sessions, 1-29 Sep),
// never from documentation. Fields used are only ones seen in every session:
// identifier.id, startTime/stopTime (LOCAL, no zone) + timezoneOffsetMinutes,
// durationMillis, distanceMeters (absent indoors), hrAvg, hrMax, sport.id.
//
// Sport ids carry no names in the payload. Each id below was matched against
// the Oura workout recorded at the same time on the same wrist. Ids not listed
// are stored as "polar:<id>" rather than guessed; remap them in SQL once named.
const POLAR = "https://www.polaraccesslink.com/v4/data";
const POLAR_SPORT: Record<string, string> = {
  "1": "running",          // 2/2 matched Oura running
  "2": "cycling",          // 2/2 matched Oura cycling (indoor, no distance)
  "3": "walking",          // 13/13 matched Oura walking
  "15": "strengthTraining",// 8/8 matched Oura strengthTraining
  "27": "running",         // 4/4 matched Oura running (likely Polar's trail-run profile)
  "33": "yoga",            // 4/4 matched Oura yoga
  // Added 26 Oct 2026 (v8) from Ville's 10–14 Oct sessions, same rule:
  "9": "nordicWalking",    // 1/1 matched Oura nordicWalking (13 Oct)
  "11": "walking",         // 2/2 matched Oura walking (10–11 Oct); a second walking profile, like 1/27 for running
  "24": "crossCountrySkiing", // 4/4 matched Oura crossCountrySkiing (10–14 Oct); classic vs skate not yet known
};
// Excluded by John, 29 Sep 2026: Ville's Polar sport ids 16 and 83 are not
// stored at all (never shown, never counted). Unknown ids not listed here are
// still stored as "polar:<id>" so a new profile is noticed rather than lost.
const POLAR_EXCLUDED_SPORT_IDS = ["16", "83"];
const POLAR_MAX_DAYS = 30; // the API rejects ranges over 90 days; stay well inside

function stripGps(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripGps);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "latitude" || k === "longitude") continue;
      out[k] = stripGps(x);
    }
    return out;
  }
  return v;
}

async function syncPolar(userId: string, token: string, startDay: string, endDay: string) {
  const sessions: Record<string, unknown>[] = [];
  let from = startDay;
  while (from <= endDay) {
    const toD = new Date(`${from}T00:00:00Z`);
    toD.setUTCDate(toD.getUTCDate() + POLAR_MAX_DAYS);
    const endNext = new Date(`${endDay}T00:00:00Z`);
    endNext.setUTCDate(endNext.getUTCDate() + 1);
    const to = isoDay(toD < endNext ? toD : endNext);
    // Naive timestamps only: with Z, +00:00 or a bare date the endpoint returns 400.
    const url = `${POLAR}/training-sessions/list?from=${from}T00:00:00&to=${to}T00:00:00`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) throw new Error(`polar training-sessions failed (${res.status}): ${text.slice(0, 300)}`);
    const body = JSON.parse(text || "{}") as { trainingSessions?: Record<string, unknown>[] };
    if (Array.isArray(body.trainingSessions)) sessions.push(...body.trainingSessions);
    from = to;
  }

  const rows = sessions
    .filter((s) => (s.identifier as { id?: string } | undefined)?.id && typeof s.startTime === "string")
    .filter((s) => !POLAR_EXCLUDED_SPORT_IDS.includes(String((s.sport as { id?: unknown } | undefined)?.id ?? "")))
    .map((s) => {
      const local = s.startTime as string;                       // "2026-09-28T16:49:20"
      const offset = Number(s.timezoneOffsetMinutes ?? 0);
      const startedUtc = new Date(Date.parse(`${local}Z`) - offset * 60000);
      const sportId = String((s.sport as { id?: unknown } | undefined)?.id ?? "");
      const metres = s.distanceMeters != null ? Number(s.distanceMeters) : null;
      return {
        user_id: userId,
        vendor: "polar",
        vendor_session_id: String((s.identifier as { id: string }).id),
        sport: POLAR_SPORT[sportId] ?? (sportId ? `polar:${sportId}` : null),
        source: null,                                            // a watch session is always client-started
        started_at: startedUtc.toISOString(),
        day: local.slice(0, 10),                                 // the client's own calendar day
        duration_minutes: s.durationMillis != null ? Math.round((Number(s.durationMillis) / 60000) * 10) / 10 : null,
        distance_km: metres != null ? Math.round((metres / 1000) * 100) / 100 : null,
        hr_avg: s.hrAvg != null ? Number(s.hrAvg) : null,
        hr_max: s.hrMax != null ? Number(s.hrMax) : null,
        raw: stripGps(s),                                        // location is not needed and not kept
        fetched_at: new Date().toISOString(),
      };
    });

  if (rows.length) {
    const { error } = await admin().from("wearable_workouts")
      .upsert(rows, { onConflict: "user_id,vendor,vendor_session_id" });
    if (error) throw new Error(`polar workout upsert failed: ${error.message}`);
  }
  return { days: 0, workouts: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({})) as { vendor?: Vendor; days?: number; user_id?: string };

    const vendor = body.vendor;
    if (!vendor || !(vendor in VENDORS)) return json({ error: "vendor must be 'oura' or 'polar'" }, 400);

    let userId: string | null = null;
    if (bearer && bearer === SERVICE_KEY) {
      if (!body.user_id) return json({ error: "user_id required for service calls" }, 400);
      userId = body.user_id;
    } else {
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user } } = await client.auth.getUser();
      if (!user) return json({ error: "not signed in" }, 401);
      userId = user.id;
    }

    const days = Math.min(Math.max(body.days ?? 7, 1), 180);
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);

    const token = await freshAccessToken(userId, vendor);
    const result = vendor === "polar"
      ? await syncPolar(userId, token, isoDay(start), isoDay(end))
      : await syncOura(userId, token, isoDay(start), isoDay(end));

    await admin().from("wearable_connections").update({
      status: "connected",
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("vendor", vendor);

    return json({ ok: true, vendor, ...result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
