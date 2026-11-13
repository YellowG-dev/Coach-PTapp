// Runs the REAL wearable-sync source (types stripped by esbuild) against a fake
// Oura and a fake database. Usage: node test-oura-hr.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { transformSync } from "esbuild";

const src = fs.readFileSync((process.argv[2] || "supabase/functions/wearable-sync/index.ts"), "utf8");
let js = transformSync(src, { loader: "ts", format: "esm" }).code;
js = js.replace(/^import .*supabase-js.*$/m, "const createClient = () => ({});")
       .replace(/^import \{[^}]*\} from "\.\/shared\.ts";$/m, "const { CORS, VENDORS, admin, freshAccessToken, json, ANON_KEY, SUPABASE_URL, SERVICE_KEY } = globalThis.__shared;")
       .replace("Deno.serve(", "(() => {})(") + "\nexport { syncOura, summariseHeartRate, wantsHeartRate };\n";
assert.ok(!/^import /m.test(js), "an import was left unstubbed");
const builtPath = path.join(os.tmpdir(), `wearable-sync-built-${process.pid}.mjs`);
fs.writeFileSync(builtPath, js);

// ---- fake database -------------------------------------------------------
const table = new Map(); // vendor_session_id -> row
const upserts = [];
const db = {
  from(name) {
    return {
      upsert(rows) {
        if (name === "wearable_workouts") {
          upserts.push(rows.map((r) => Object.keys(r).sort().join(",")));
          const cols = new Set(rows.map((r) => Object.keys(r).sort().join(",")));
          assert.equal(cols.size, 1, "rows in one upsert must share columns");
          for (const r of rows) table.set(r.vendor_session_id, { hr_avg: null, hr_max: null, ...(table.get(r.vendor_session_id) || {}), ...r });
        }
        return Promise.resolve({ error: null });
      },
      select() { const q = { eq: () => q, in: (_c, ids) => Promise.resolve({ data: ids.filter((i) => table.has(i)).map((i) => ({ vendor_session_id: i, hr_avg: table.get(i).hr_avg })), error: null }) }; return q; },
    };
  },
};
globalThis.__shared = { CORS: {}, VENDORS: {}, admin: () => db, freshAccessToken: async () => "t", json: () => {}, ANON_KEY: "", SUPABASE_URL: "", SERVICE_KEY: "" };

// ---- fake Oura -----------------------------------------------------------
const W = (id, activity, source, start, mins, extra = {}) => ({ id, activity, source, day: start.slice(0, 10), start_datetime: start, end_datetime: new Date(Date.parse(start) + mins * 60000).toISOString(), intensity: "moderate", ...extra });
const workouts = [
  W("walk56", "walking", "workout_heart_rate", "2026-11-01T19:53:20.251+02:00", 56, { distance: 5132.1 }),
  W("gym", "strengthTraining", "workout_heart_rate", "2026-11-01T10:59:28.856+02:00", 74.8),
  W("w13", "walking", "confirmed", "2026-11-01T13:21:00.000+02:00", 13),
  W("house", "houseWork", "confirmed", "2026-11-01T18:41:00.000+02:00", 13),
  W("run", "running", "confirmed", "2026-10-31T10:00:00.000+02:00", 40),
  W("sparse", "cycling", "manual", "2026-10-30T10:00:00.000+02:00", 20),
];
let hrMode = "ok"; const hrCalls = [];
const hrFor = (startMs, endMs) => {
  const w = workouts.find((x) => Date.parse(x.start_datetime) === startMs);
  if (w.id === "sparse") return [{ bpm: 100, timestamp: new Date(startMs + 60000).toISOString(), source: "awake" }];
  const out = []; let i = 0;
  for (let t = startMs - 120000; t <= endMs + 120000; t += 30000) out.push({ bpm: w.id === "walk56" ? 110 + (i++ % 21) : 95 + (i++ % 40), timestamp: new Date(t).toISOString(), source: "workout" });
  return out;
};
globalThis.fetch = async (url) => {
  const u = new URL(url); const path = u.pathname.split("/").pop();
  const ok = (data, next_token = null) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data, next_token }) });
  if (path === "workout") return ok(workouts);
  if (path !== "heartrate") return ok([]);
  hrCalls.push(u.search);
  if (hrMode === "noscope") return { ok: false, status: 401, text: async () => "missing scope" };
  if (hrMode === "boom") return { ok: false, status: 500, text: async () => "oops" };
  const s = Date.parse(u.searchParams.get("start_datetime")), e = Date.parse(u.searchParams.get("end_datetime"));
  assert.ok(Number.isFinite(s) && Number.isFinite(e), "datetimes must parse");
  const all = hrFor(s, e);
  // two pages, to exercise next_token
  if (!u.searchParams.get("next_token")) return ok(all.slice(0, 50), all.length > 50 ? "p2" : null);
  return ok(all.slice(50));
};

const { syncOura, summariseHeartRate, wantsHeartRate } = await import(pathToFileURL(builtPath).href);
let pass = 0, fail = 0;
const ok = async (name, fn) => { try { await fn(); pass++; console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e.message).split("\n")[0]}`); } };
const row = (id) => table.get(id);

console.log("\nconnection without the heartrate scope (everyone, until they reconnect)");
hrMode = "noscope";
let r1;
await ok("sync still succeeds and stores all workouts", async () => { r1 = await syncOura("u", "t", "2026-10-28", "2026-11-01"); assert.equal(r1.workouts, 6); assert.equal(table.size, 6); });
await ok("it reports heart rate as unavailable, not as an error", () => { assert.match(r1.hr.unavailable, /401/); assert.equal(r1.hr.error, null); assert.equal(r1.hr.filled, 0); });
await ok("it stops asking after the first refusal (at most one call per worker)", () => assert.ok(hrCalls.length <= 4, `${hrCalls.length} calls`));
await ok("no heart rate stored", () => assert.equal(row("walk56").hr_avg, null));

console.log("\nafter reconnecting with the heartrate scope");
hrMode = "ok"; hrCalls.length = 0; upserts.length = 0;
let r2;
await ok("sync fills heart rate", async () => { r2 = await syncOura("u", "t", "2026-10-28", "2026-11-01"); assert.equal(r2.hr.error, null); assert.equal(r2.hr.unavailable, null); });
await ok("asked only for real sessions: not the 13-min walk, not housework", () => assert.equal(hrCalls.filter((c) => !c.includes("next_token")).length, 4));
await ok("walk 56 min: average and max from samples INSIDE the session window only", () => {
  const w = row("walk56"); assert.equal(w.hr_max, 130); assert.ok(w.hr_avg >= 118 && w.hr_avg <= 122, `avg ${w.hr_avg}`);
});
await ok("strength session and accepted run get heart rate too", () => { assert.ok(row("gym").hr_avg > 0); assert.ok(row("run").hr_avg > 0); });
await ok("13-min auto walk and housework: none", () => { assert.equal(row("w13").hr_avg, null); assert.equal(row("house").hr_avg, null); });
await ok("a session with under 3 samples stores nothing (counted as no_data)", () => { assert.equal(row("sparse").hr_avg, null); assert.equal(r2.hr.no_data, 1); assert.equal(r2.hr.filled, 3); });
await ok("other columns are unchanged (duration, distance, sport)", () => { const w = row("walk56"); assert.equal(w.duration_minutes, 56); assert.equal(w.distance_km, 5.13); assert.equal(w.sport, "walking"); });

console.log("\nlater syncs");
hrCalls.length = 0;
let r3;
await ok("sessions that already have heart rate are not asked again", async () => { r3 = await syncOura("u", "t", "2026-10-28", "2026-11-01"); assert.equal(hrCalls.filter((c) => !c.includes("next_token")).length, 1); /* only 'sparse' */ });
await ok("a re-sync never wipes a stored heart rate", () => { assert.equal(row("walk56").hr_max, 130); assert.ok(row("gym").hr_avg > 0); });
hrMode = "boom";
table.get("walk56").hr_avg = null; table.get("walk56").hr_max = null;
let r4;
await ok("an Oura heart-rate outage does not fail the sync", async () => { r4 = await syncOura("u", "t", "2026-10-28", "2026-11-01"); assert.equal(r4.workouts, 6); assert.match(r4.hr.error, /500/); });
await ok("...and leaves the other sessions' stored heart rate intact", () => assert.ok(row("gym").hr_avg > 0));

console.log("\nhelpers");
await ok("summariseHeartRate ignores samples outside the window and bad values", () => {
  const s = summariseHeartRate([{ bpm: 200, timestamp: "2026-01-01T00:00:00Z" }, { bpm: 100, timestamp: "2026-01-01T01:00:00Z" }, { bpm: 110, timestamp: "2026-01-01T01:10:00Z" }, { bpm: 120, timestamp: "2026-01-01T01:20:00Z" }, { bpm: 0, timestamp: "2026-01-01T01:25:00Z" }, { bpm: "x", timestamp: "2026-01-01T01:26:00Z" }], Date.parse("2026-01-01T01:00:00Z"), Date.parse("2026-01-01T01:30:00Z"));
  assert.deepEqual(s, { hr_avg: 110, hr_max: 120, samples: 3 });
});
await ok("wantsHeartRate follows the app's real-session rule", () => {
  assert.equal(wantsHeartRate({ source: "manual", sport: "other", duration_minutes: 5 }), true);
  assert.equal(wantsHeartRate({ source: "confirmed", sport: "walking", duration_minutes: 29 }), false);
  assert.equal(wantsHeartRate({ source: "confirmed", sport: "walking", duration_minutes: 30 }), true);
  assert.equal(wantsHeartRate({ source: "autodetected", sport: "running", duration_minutes: 40 }), false);
});
console.log(`\ntest-oura-hr: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
