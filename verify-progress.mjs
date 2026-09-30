// verify-progress — pure tests of src/core/progress.js (Coach redesign R3).
// Run: node verify-progress.mjs
// Fixture logs/programmes; wearable rows are inline; `today` is fixed.

import fs from "fs";
import { buildAllAdherence, indexByDay } from "./src/core/adherence.js";
import { buildRecovery } from "./src/core/recovery.js";
import { buildNameMap } from "./src/core/names.js";
import { buildPersonCtx, versionFor } from "./src/core/overview.js";
import {
  recoveryTrends, trendRowsFor, trackedCards, exercisesWithHistory, loadSeriesFor, consistencySeries, sessionsBySport,
} from "./src/core/progress.js";

const ID = { juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee", henna: "5b757e16-813a-46f6-be67-423ff3b093cc", joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d", ghost: "ghost" };
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const programs = read("programs.json");
const TODAY = new Date(2026, 8, 18);

let passed = 0, failed = 0;
const check = (name, ok, extra) => {
  if (ok) passed++;
  else { failed++; console.log("FAIL  " + name + (extra !== undefined ? "  got " + JSON.stringify(extra) : "")); }
};

const dayKey = (n) => { const d = new Date(2026, 8, 18 - n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
// The fixture logs carry no set weights, so three sessions are added inline.
const loadsLog = (n, w) => ({ day: dayKey(n), payload: { done: {}, loads: { "db-bench": [{ w, r: 8 }, { w: w - 2, r: 8 }], "up-2": [{ w: null, r: 6 }] } } });
const roster = [{ id: ID.juha, name: "Juha" }, { id: ID.henna, name: "Henna" }, { id: ID.joonatan, name: "Joonatan" }, { id: ID.ghost, name: "Ghost" }];
const logs = { [ID.juha]: [...rows(read("logs-juha.json")).filter((r) => ![10, 8, 5].map(dayKey).includes(r.day)), loadsLog(10, 20), loadsLog(8, 22), loadsLog(5, 24)].sort((a, b) => (a.day < b.day ? -1 : 1)), [ID.henna]: rows(read("logs-henna.json")), [ID.joonatan]: rows(read("logs-joonatan.json")), ghost: [{ day: "2026-09-01", payload: { done: {} } }] };
const overrides = { [ID.juha]: rows(read("overrides-juha.json")), [ID.joonatan]: rows(read("overrides-joonatan.json")) };

// Juha wearables: 40 nights of Oura with two missing nights and a null-sleep
// day; a run recorded by both vendors; strength; a chore row that never counts.
const missing = new Set([dayKey(3), dayKey(4)]);
const days = [];
for (let n = 1; n <= 40; n++) {
  if (missing.has(dayKey(n))) continue;
  days.push({ user_id: ID.juha, vendor: "oura", day: dayKey(n), sleep_minutes: n === 6 ? null : 420 + n, readiness: 70 + (n % 5), resting_hr: 50 + (n % 3), hrv: 55 + (n % 7), steps: 8000 + n * 10 });
}
const W = (o) => ({ user_id: ID.juha, vendor: "polar", distance_km: null, hr_avg: null, hr_max: null, ...o });
const workouts = {
  [ID.juha]: [
    W({ day: dayKey(2), sport: "running", started_at: dayKey(2) + "T05:00:00Z", duration_minutes: 40, distance_km: 7.5 }),
    W({ vendor: "oura", source: "workout_heart_rate", day: dayKey(2), sport: "running", started_at: dayKey(2) + "T05:01:00Z", duration_minutes: 40 }),
    W({ vendor: "oura", source: "confirmed", day: dayKey(1), sport: "houseWork", started_at: dayKey(1) + "T09:00:00Z", duration_minutes: 90 }),
    W({ day: dayKey(1), sport: "strengthTraining", started_at: dayKey(1) + "T16:00:00Z", duration_minutes: 55 }),
    W({ day: dayKey(45), sport: "running", started_at: dayKey(45) + "T05:00:00Z", duration_minutes: 30 }), // outside 30 days
  ],
};
const data = { roster, logs, overrides, programs, wearables: { connections: [], days: { [ID.juha]: days }, workouts } };
const adh = buildAllAdherence(roster, logs, overrides, programs);
const ctxFor = (p) => {
  const w = data.wearables;
  return buildPersonCtx(data, p, {
    today: TODAY,
    recovery: buildRecovery((w.days || {})[p.id] || [], (w.workouts || {})[p.id] || [], p.id),
    adherence: adh[p.id],
    names: buildNameMap(programs.filter((r) => r.assigned_to === p.id).map((r) => ({ definition: r.definition })), overrides[p.id]),
  });
};
const juha = ctxFor(roster[0]);

// --- recovery trends
{
  const t = recoveryTrends(juha.recovery, juha.days, ID.juha);
  check("five recovery charts (sleep, readiness, HRV, resting HR, steps)", t && t.map((c) => c.id).join() === "sleepH,readiness,hrv,rhr,steps", t && t.map((c) => c.id));
  check("each chart spans 30 calendar days", t.every((c) => c.data.length === 30));
  check("last point is the newest night", t[0].data[29].day === dayKey(1));
  const sleep = t[0].data;
  const at = (n) => sleep.find((d) => d.day === dayKey(n));
  check("a missing night is a gap, not zero", at(3).value === null && at(4).value === null, [at(3), at(4)]);
  check("a night with no sleep reading is a gap in sleep", at(6).value === null);
  check("no zero values anywhere", t.every((c) => c.data.every((d) => d.value !== 0)));
  check("7-day average ignores gaps", Math.abs(at(1).avg7 - [1, 2, 5, 7].map((n) => (420 + n) / 60).reduce((a, b) => a + b, 0) / 4) < 0.15, at(1));
  check("latest value = newest reading", Math.abs(t[0].latest - 7.0167) < 0.1 && t[1].latestDay === dayKey(1), t[0].latest);
  check("vs 30-day avg is a number", typeof t[0].vs30 === "number" && typeof t[4].vs30 === "number");
  check("steps come from the wearable days", t[4].data[29].value === 8010, t[4].data[29]);
  check("no wearable → null", recoveryTrends(buildRecovery([], [], "x"), [], "x") === null);
}

// --- tracked items
{
  const rowsJ = trendRowsFor(juha);
  check("today is not in the trend rows", !rowsJ.some((r) => r.date === "2026-09-18"));
  const cards = trackedCards(juha, rowsJ);
  const def = versionFor(juha, TODAY).definition;
  const t = def.tracking;
  const has = (bucket, id) => rowsJ.some((r) => typeof r[bucket][id] === "number");
  const want = [
    ...(t.scales || []).filter((c) => has("scales", c.id)).map((c) => c.id),
    ...(t.numbers || []).filter((c) => c.chart !== false).filter((c) => (c.rollingTotal ? rowsJ.some((r) => r.numbers[c.id] > 0) : has("numbers", c.id))).map((c) => c.id),
    ...(t.rates || []).filter((c) => rowsJ.length).map((c) => c.id),
  ].sort();
  check("one card per tracking entry that has data", JSON.stringify(cards.map((c) => c.id).sort()) === JSON.stringify(want), [cards.map((c) => c.id), want]);
  check("at least one tracked card for Juha", cards.length >= 1, cards.length);
  const knee = cards.find((c) => c.id === "chk-knee");
  check("scale card: fixed 1..max axis", knee && knee.domain[0] === 1 && knee.domain[1] === 4, knee && knee.domain);
  const walk = cards.find((c) => c.id === "chk-walk");
  check("rate card: percentage axis, hides raw value", walk && walk.unit === "%" && walk.hideValue && walk.domain[1] === 100);
  check("cards keep at most 60 points", cards.every((c) => c.data.length <= 60));
  const henna = ctxFor(roster[1]);
  check("string scales (Henna) are cards too", trackedCards(henna, trendRowsFor(henna)).every((c) => typeof c.title === "string"));
  const ghost = ctxFor(roster[3]);
  check("no programme → no tracked cards, no throw", trackedCards(ghost, trendRowsFor(ghost)).length === 0);
}

// --- getting stronger
{
  const ex = exercisesWithHistory(juha);
  check("Juha has exercises with logged weights", ex.length > 0, ex.length);
  check("exercises are sorted by name", ex.every((e, i) => i === 0 || ex[i - 1].name.localeCompare(e.name) <= 0));
  check("only exercises with a logged weight (pull-up has reps only)", ex.length === 1 && ex[0].id === "db-bench", ex);
  check("name comes from the programme, not the raw id", ex[0].name === "Dumbbell bench press", ex[0]);
  const s = loadSeriesFor(juha, "db-bench");
  check("load series: heaviest set per session, ascending", s.map((p) => p.maxWeight).join() === "20,22,24", s);
  check("load series ≤ 30 points", s.length <= 30);
  check("no exercise → empty series", loadSeriesFor(juha, null).length === 0);
  check("no logs → no exercises", exercisesWithHistory(ctxFor({ id: "nobody", name: "N" })).length === 0);
}

// --- consistency
{
  const c = consistencySeries(juha);
  const skipDays = new Set(juha.adherence.days.filter((d) => d.skip).map((d) => d.date));
  check("consistency has points", c.length > 0);
  check("≤ 60 days, ascending, percent in 0..100", c.every((p, i) => p.pct >= 0 && p.pct <= 100 && (i === 0 || c[i - 1].date < p.date)) && c.length <= 60);
  check("skip days are absent, not zero", !c.some((p) => skipDays.has(p.date)));
  check("today is absent", !c.some((p) => p.date === "2026-09-18"));
  check("7-day average present", c.every((p) => typeof p.avg7 === "number"));
  const ghost = ctxFor(roster[3]);
  check("no programme → no consistency", consistencySeries(ghost).length === 0);
}

// --- sessions by sport
{
  const s = sessionsBySport(juha);
  const run = s.find((x) => x.sport === "running");
  check("Oura + Polar copy of one run counts once", run && run.n === 1 && run.minutes === 40, s);
  check("chores are not sessions", !s.some((x) => /house/i.test(x.sport)));
  check("older than 30 days is left out", run.n === 1);
  check("strength counted", s.some((x) => x.sport === "strengthTraining" && x.n === 1));
  check("each row has a colour; same sport, same colour", s.every((x) => /^#/.test(x.color)));
  check("most minutes first", s.every((x, i) => i === 0 || s[i - 1].minutes >= x.minutes));
  check("no workouts → empty", sessionsBySport(ctxFor(roster[1])).length === 0);
}

console.log(`\nverify-progress: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
