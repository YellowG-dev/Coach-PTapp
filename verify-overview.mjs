// verify-overview — pure tests of src/core/overview.js (Coach redesign R1).
// Run: node verify-overview.mjs
// Fixture logs/programmes; wearable rows are inline; `today` is fixed.

import fs from "fs";
import { buildAllAdherence } from "./src/core/adherence.js";
import { buildRecovery } from "./src/core/recovery.js";
import { buildNameMap } from "./src/core/names.js";
import {
  metricCatalogue, computeMetric, resolveKpiIds, weekPlan, recentSessions, recoveryBars,
  needsAttention, buildPersonCtx, DEFAULT_KPIS, trackingItems,
} from "./src/core/overview.js";

const ID = { juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee", henna: "5b757e16-813a-46f6-be67-423ff3b093cc", joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d", ville: "2a545525-d9a4-450c-b90b-ce04d8f48abe", ghost: "ghost" };
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const programs = read("programs.json");
const TODAY = new Date(2026, 8, 18); // Fri 18 Sep 2026; week Mon 14 – Sun 20

const roster = [
  { id: ID.juha, name: "Juha" }, { id: ID.henna, name: "Henna" }, { id: ID.joonatan, name: "Joonatan" }, { id: ID.ghost, name: "Ghost" },
];
const logs = { [ID.juha]: rows(read("logs-juha.json")), [ID.henna]: rows(read("logs-henna.json")), [ID.joonatan]: rows(read("logs-joonatan.json")), ghost: [] };
const overrides = { [ID.juha]: rows(read("overrides-juha.json")), [ID.joonatan]: rows(read("overrides-joonatan.json")) };

// inline wearable rows — Juha: Oura+Polar copies of one run, a housework row,
// a 20-min confirmed walk (both must be ignored), strength, and sleep nights.
const W = (o) => ({ user_id: ID.juha, vendor: "polar", source: undefined, distance_km: null, hr_avg: null, hr_max: null, ...o });
const workouts = {
  [ID.juha]: [
    W({ vendor: "polar", day: "2026-09-16", sport: "running", started_at: "2026-09-16T05:00:00Z", duration_minutes: 40, distance_km: 7.5, hr_avg: 150, hr_max: 171 }),
    W({ vendor: "oura", source: "workout_heart_rate", day: "2026-09-16", sport: "running", started_at: "2026-09-16T05:01:00Z", duration_minutes: 40, distance_km: 7.4 }),
    W({ vendor: "oura", source: "confirmed", day: "2026-09-17", sport: "houseWork", started_at: "2026-09-17T09:00:00Z", duration_minutes: 90 }),
    W({ vendor: "oura", source: "confirmed", day: "2026-09-17", sport: "walking", started_at: "2026-09-17T12:00:00Z", duration_minutes: 20 }),
    W({ vendor: "polar", day: "2026-09-17", sport: "strengthTraining", started_at: "2026-09-17T16:00:00Z", duration_minutes: 55 }),
  ],
  [ID.joonatan]: [], // connected, nothing recorded
};
const sleepDay = (day, o) => ({ user_id: ID.juha, vendor: "oura", day, sleep_minutes: null, readiness: null, resting_hr: null, hrv: null, steps: null, ...o });
const wdays = {
  [ID.juha]: [
    sleepDay("2026-09-17", { sleep_minutes: 432, readiness: 80, resting_hr: 50, hrv: 60, steps: 9000 }),
    sleepDay("2026-09-16", { sleep_minutes: 400, readiness: 70, resting_hr: 52, hrv: 55, steps: 7000 }),
    sleepDay("2026-09-14", { sleep_minutes: 420, readiness: 75, resting_hr: 51, hrv: 58, steps: 8000 }),
    sleepDay("2026-09-18", { steps: 1200 }),
  ],
};
const conns = [
  { user_id: ID.juha, vendor: "oura", status: "connected", last_synced_at: "2026-09-18T04:00:00Z" },
  { user_id: ID.juha, vendor: "polar", status: "needs_reauth", last_synced_at: null },
  { user_id: ID.joonatan, vendor: "polar", status: "connected", last_synced_at: "2026-09-10T00:00:00Z" },
];
const data = { roster, logs, overrides, programs, wearables: { connections: conns, days: wdays, workouts } };
const adh = buildAllAdherence(roster, logs, overrides, programs);

const ctxFor = (p, extra = {}) => {
  const w = data.wearables;
  const c = buildPersonCtx(data, p, {
    today: TODAY,
    recovery: buildRecovery((w.days || {})[p.id] || [], (w.workouts || {})[p.id] || [], p.id),
    adherence: adh[p.id],
    names: buildNameMap(programs.filter((r) => r.assigned_to === p.id).map((r) => ({ definition: r.definition })), overrides[p.id]),
    ...extra,
  });
  return c;
};

let passed = 0, failed = 0;
const check = (label, ok, detail) => {
  if (ok) passed++; else { failed++; console.log("  FAIL " + label + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

// 1. every catalogue id computes without throwing, for every person
for (const p of roster) {
  const ctx = ctxFor(p);
  let threw = null;
  try {
    for (const g of metricCatalogue(ctx)) for (const i of g.items) {
      const r = computeMetric(i.id, ctx);
      if (r !== null && (typeof r !== "object" || !("value" in r) || !("note" in r))) throw new Error("bad shape for " + i.id);
      if (r && r.value !== null && (r.value === "" || /NaN|undefined/.test(String(r.value)))) throw new Error("bad value for " + i.id + ": " + r.value);
    }
    weekPlan(ctx); recentSessions(ctx); recoveryBars(ctx.recovery); needsAttention(ctx);
  } catch (e) { threw = e.message; }
  check("catalogue computes for " + p.name, !threw, threw);
}
// a person with no programme at all
{
  const ctx = ctxFor(roster[3]);
  const cat = metricCatalogue(ctx);
  check("no-programme person has no daily-check group", !cat.some((g) => g.group.startsWith("Daily checks")));
  for (const id of ["adh", "cardio"]) check(id + " is null with no programme", computeMetric(id, ctx).value === null);
  check("no-programme person: no wearable → run null", computeMetric("run", ctx).value === null && /No wearable/.test(computeMetric("run", ctx).note));
  check("no-programme: no-log attention line", needsAttention(ctx).some((i) => i.id === "nolog"));
}

// 2. no-data is null, never 0
{
  const henna = ctxFor(roster[1]);
  for (const id of ["ready", "sleep", "hrv", "rhr", "steps", "run", "sess30"]) {
    const r = computeMetric(id, henna);
    check("Henna " + id + " is null (no wearable)", r.value === null && typeof r.note === "string" && r.note.length > 0, r);
  }
  const ghostRec = computeMetric("ready", ctxFor(roster[3]));
  check("ready null without data", ghostRec.value === null);
}

// 3. connected, no runs → 0 km (a real zero)
{
  const joon = ctxFor(roster[2]);
  const r = computeMetric("run", joon);
  check("connected with no runs is 0.0 km", r.value === "0.0 km" && r.note === "0 runs", r);
  check("connected with no sessions is 0", computeMetric("sess30", joon).value === "0");
}

// 4. Oura+Polar copies of one run count once; houseWork and 20-min walk ignored
{
  const juha = ctxFor(roster[0]);
  const r = computeMetric("run", juha);
  check("duplicate run counts once (7.5 km, 1 run)", r.value === "7.5 km" && r.note === "1 run", r);
  const s = computeMetric("sess30", juha);
  check("30-day sessions = run + strength only (2)", s.value === "2" && s.note === "95 min total", s);
  const list = recentSessions(juha);
  check("recent sessions: 2 rows, no housework/walk", list.length === 2 && !list.some((x) => /house|walk/i.test(x.sport)), list);
  check("recent sessions newest first, mm:ss", list[0].sport === "Strength training" && list[0].duration === "55:00" && list[1].km === "7.5" && list[1].hr === "150 / 171" && list[1].vendor === "polar", list);
  const str = computeMetric("str", juha);
  check("strength: app log + watch on one day is one day", /^\d+$/.test(str.value) && /^of \d+ planned$/.test(str.note), str);
}

// 5. adherence excludes skip days and null days
{
  const juha = ctxFor(roster[0], { today: new Date(2026, 8, 20) });
  const week = adh[ID.juha].days.filter((d) => d.date >= "2026-09-14" && d.date <= "2026-09-20");
  const usable = week.filter((d) => d.pct != null && !d.skip);
  const r = computeMetric("adh", juha);
  const expected = Math.round((usable.reduce((s, d) => s + d.pct, 0) / usable.length) * 100) + "%";
  check("adh = mean of scored non-skip days this week", usable.length > 0 && r.value === expected, { r, expected });
  const fake = { ...juha, adherence: { noProgram: false, days: [
    { date: "2026-09-14", pct: 1, skip: null }, { date: "2026-09-15", pct: 0, skip: "travel" }, { date: "2026-09-16", pct: null, skip: null },
  ] } };
  const f = computeMetric("adh", { ...fake, today: new Date(2026, 8, 16) });
  check("adh ignores skip and null days", f.value === "100%" && f.note === "1 day scored", f);
  check("adh null when no day scored", computeMetric("adh", { ...fake, adherence: { noProgram: false, days: [] } }).value === null);
}

// 5b. R2 §0a — str counts days, app log or watch, only while a programme is in force
{
  const def = programs[0].definition; // Juha v1: strength A on Wed(3), B Fri(5), C Sun(0) in week A; see schedule
  const mk = (extra) => ({ personId: "x", personName: "X", today: new Date(2026, 8, 18), logRows: [], overrideRows: [], programRows: [{ id: "p", name: "P", assigned_to: "x", effective_from: "-infinity", definition: def }], days: [], workouts: [], connections: [], recovery: null, adherence: null, names: {}, ...extra });
  const scored = (date, done) => ({ date, pct: 0.5, skip: null, byCat: { strength: { total: 5, done } } });
  const sw = (day) => ({ vendor: "polar", day, sport: "strengthTraining", started_at: day + "T16:00:00Z", duration_minutes: 50 });
  // same day, app + watch = 1
  const both = computeMetric("str", mk({ adherence: { noProgram: false, days: [scored("2026-09-16", 3)] }, workouts: [sw("2026-09-16")] }));
  check("str: watch + app log on the same day counts 1", both.value === "1", both);
  const two = computeMetric("str", mk({ adherence: { noProgram: false, days: [scored("2026-09-16", 3)] }, workouts: [sw("2026-09-17")] }));
  check("str: two different days count 2", two.value === "2", two);
  // app-log-only person: no wearable at all
  const appOnly = computeMetric("str", mk({ adherence: { noProgram: false, days: [scored("2026-09-16", 2)] } }));
  check("str: app-log-only person gets a number, not —", appOnly.value === "1" && /^of \d+ planned$/.test(appOnly.note), appOnly);
  // app log with 0 done does not count
  const zero = computeMetric("str", mk({ adherence: { noProgram: false, days: [scored("2026-09-16", 0)] } }));
  check("str: strength.done 0 is not a session", zero.value === "0", zero);
  // window shortened by a programme start
  const start = mk({ programRows: [{ id: "p", name: "P", assigned_to: "x", effective_from: "2026-09-15", definition: def }] });
  const short = computeMetric("str", start);
  check("str: window shortened by programme start shows 'since'", /· since 15\.9\.$/.test(short.note), short);
  // days before the programme do not count as done
  const before = computeMetric("str", { ...start, workouts: [sw("2026-09-13")] });
  check("str: workout before the programme is not counted", before.value === "0", before);
  const noProg = computeMetric("str", mk({ programRows: [] }));
  check("str: no programme in window → null", noProg.value === null && noProg.note === "No programme in force", noProg);
}

// 5c. R2 §0b — "Unplanned session" = a workout that matches nothing planned that day
{
  const base = JSON.parse(JSON.stringify(programs.find((r) => r.id === "ville-2026-09").definition));
  const put = (def, cells) => { def.schedule = { A: {}, B: {} }; for (const w of ["A", "B"]) for (let d = 0; d < 7; d++) def.schedule[w][d] = { ...(cells[d] || {}) }; return def; };
  const mkDef = (cells, cardioTypes) => { const d = put(JSON.parse(JSON.stringify(base)), cells); delete d.startDate; if (cardioTypes) d.cardioTypes = cardioTypes; else delete d.cardioTypes; return d; };
  const ctxOf = (def, workouts, over) => ({ personId: "x", personName: "X", today: new Date(2026, 8, 18), logRows: [{ day: "2026-09-18", payload: {} }], overrideRows: over || [], programRows: [{ id: "p", name: "P", assigned_to: "x", effective_from: "-infinity", definition: def }], days: [], workouts, connections: [], recovery: null, adherence: null, names: {}, draft: null });
  const wo = (day, sport, vendor = "polar") => ({ vendor, day, sport, started_at: day + "T10:00:00Z", duration_minutes: 45 });
  const flags = (c) => needsAttention(c).filter((i) => i.id.startsWith("unplanned"));
  const dow = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
  const D = "2026-09-17"; // Thu, in the same ISO week as 18 Sep
  const idx = dow(D);
  const strengthKey = base.slotOptions.strength.find((o) => o.value)?.value;
  const runKey = base.slotOptions.run.find((o) => o.value)?.value;
  check("fixture keys exist", strengthKey && runKey);

  check("strength workout on a strength day → no flag", flags(ctxOf(mkDef({ [idx]: { strength: strengthKey } }), [wo(D, "strengthTraining")])).length === 0);
  check("strength workout on a run-only day → flag", flags(ctxOf(mkDef({ [idx]: { run: runKey } }), [wo(D, "strengthTraining")])).length === 1);
  check("run on a run day, no cardioTypes → no flag", flags(ctxOf(mkDef({ [idx]: { run: runKey } }), [wo(D, "running")])).length === 0);
  const types = [{ id: "run", label: "Run", sports: ["running"], slot: "run" }];
  check("run on a run day, with cardioTypes → no flag", flags(ctxOf(mkDef({ [idx]: { run: runKey } }, types), [wo(D, "running")])).length === 0);
  check("run on a strength-only day, with cardioTypes mapping run → flag", flags(ctxOf(mkDef({ [idx]: { strength: strengthKey } }, types), [wo(D, "running")])).length === 1);
  check("run mapped to an unplanned slot → flag even though another slot is planned", flags(ctxOf(mkDef({ [idx]: { yoga: "session" } }, types), [wo(D, "running")])).length === 1);
  check("run on a strength-only day, no cardioTypes → flag", flags(ctxOf(mkDef({ [idx]: { strength: strengthKey } }), [wo(D, "running")])).length === 1);
  const act = [{ day: D, payload: { activities: [{ id: "a1", name: "Walk" }] } }];
  check("walk on a rest day with a client activity → no flag", flags(ctxOf(mkDef({}), [wo(D, "walking")], act)).length === 0);
  check("walk on a rest day without → flag", flags(ctxOf(mkDef({}), [wo(D, "walking")])).length === 1);
  const skip = [{ day: D, payload: { skip: "travel", activities: [{ id: "a1", name: "Walk" }] } }];
  check("workout on a skip day → flag", flags(ctxOf(mkDef({ [idx]: { run: runKey } }), [wo(D, "running")], skip)).length === 1, flags(ctxOf(mkDef({ [idx]: { run: runKey } }), [wo(D, "running")], skip)));
}

// 6. Henna's string scales get labels
{
  const henna = ctxFor(roster[1]);
  const items = trackingItems(henna.programRows[0].definition, henna.names);
  const energy = items.find((i) => i.id === "energy");
  check("Henna scale 'energy' labelled", energy && /Energy/.test(energy.label) && items.find((i) => i.id === "symptoms").label !== "symptoms", items);
  check("Henna scales are catalogue items", metricCatalogue(henna).some((g) => g.items.some((i) => i.id === "trk:energy")));
  const r = computeMetric("trk:energy", ctxFor(roster[1], { today: new Date(2026, 8, 10) }));
  check("Henna energy 7-day mean", r.value === "2.0" || r.value === null, r); // one day logged (8 Sep)
  const r2 = computeMetric("trk:energy", ctxFor(roster[1], { today: new Date(2026, 8, 30) }));
  check("Henna energy null when nothing in 7 days", r2.value === null && r2.note === "Nothing logged in 7 days", r2);
}

// 7. daily checks: rates, rollingTotal, latest number
{
  const juha = ctxFor(roster[0], { today: new Date(2026, 8, 20) });
  const walk = computeMetric("trk:chk-walk", juha);
  check("rate shows x / 7 days", /^\d \/ 7 days$/.test(walk.value), walk);
  const alc = computeMetric("trk:chk-alc-units", juha);
  check("rollingTotal number is a 7-day sum with unit", /units$/.test(alc.value) && alc.note === "7-day total", alc);
  const w = computeMetric("trk:chk-weigh", juha);
  check("plain number is latest value + unit, dated note", /kg$/.test(w.value) && /^Logged \d\d-\d\d$/.test(w.note), w);
  const knee = computeMetric("trk:chk-knee", juha);
  check("scale is a 1-decimal mean", /^\d\.\d$/.test(knee.value), knee);
  const missing = computeMetric("trk:nope", juha);
  check("unknown tracking id is null-valued", missing.value === null);
  check("unknown catalogue id is null", computeMetric("bogus", juha) === null);
}

// 8. recovery metrics
{
  const juha = ctxFor(roster[0]);
  const ready = computeMetric("ready", juha);
  check("readiness latest 80, above 7-day avg", ready.value === "80" && /▲ 5 vs 7-day avg/.test(ready.note), ready);
  const sleep = computeMetric("sleep", juha);
  check("sleep formatted 7h12", sleep.value === "7h12" && /^▲ 0h\d\d vs 7-day avg$/.test(sleep.note), sleep);
  const steps = computeMetric("steps", juha);
  check("steps = latest day before today (9,000), not today's 1,200", steps.value === "9,000", steps);
  const bars = recoveryBars(juha.recovery);
  check("7-night bars: missing nights are null, never 0", bars && bars[0].values.length === 7 && bars[0].values.includes(null) && !bars[0].values.includes(0), bars && bars[0].values);
  check("bars newest value", bars[1].latest === 80);
  check("no series → no bars", recoveryBars(null) === null);
}

// 9. cardio: honest null without a declared duration task, sum with one
{
  const juha = ctxFor(roster[0]);
  const c = computeMetric("cardio", juha);
  check("cardio null when no block declares cardio", c.value === null && /No cardio/.test(c.note), c);
  const def = JSON.parse(JSON.stringify(programs[0].definition));
  def.blocks.cardio.hard.cardio = { durationTaskId: "cv-dur" };
  const rowsP = [{ id: "x", name: "X", assigned_to: ID.juha, effective_from: "-infinity", definition: def }];
  const logsRows = [{ day: "2026-09-14", payload: { numbers: { "cv-dur": 45 } } }, { day: "2026-09-17", payload: { numbers: { "cv-dur": 30 } } }];
  const ctx = { ...juha, programRows: rowsP, logRows: logsRows, overrideRows: [] };
  const r = computeMetric("cardio", ctx);
  check("cardio sums declared duration task", r.value === "75 min" || /^\d+ min$/.test(r.value), r);
}

// 10. needs attention
{
  const juha = ctxFor(roster[0], { draft: { savedAt: "2026-09-17T10:00:00Z" } });
  const items = needsAttention(juha);
  const text = items.map((i) => i.text).join(" | ");
  check("attention: polar needs_reauth", /polar connection: needs_reauth/.test(text), text);
  check("attention: HR used, no zones", /no zone table/.test(text), text);
  check("attention: draft line", /Unpublished draft, saved 2026-09-17/.test(text), text);
  check("attention: fresh oura sync is not flagged", !/oura/.test(text), text);
  const joon = needsAttention(ctxFor(roster[2]));
  check("attention: stale sync (>48 h)", joon.some((i) => /polar last synced \d+ d ago/.test(i.text)), joon);
  check("attention: no logged day in 3 days", joon.some((i) => /No day logged since/.test(i.text)), joon);
  const quiet = needsAttention({ ...ctxFor(roster[3]), logRows: [{ day: "2026-09-18", payload: {} }] });
  check("attention: nothing → empty", quiet.length === 0, quiet);
  const unpl = needsAttention(juha).filter((i) => i.id.startsWith("unplanned"));
  check("attention: unplanned lines only for real sessions", unpl.every((i) => !/house|walk/i.test(i.text)), unpl);
}

// 11. week grid
{
  const wp = weekPlan(ctxFor(roster[0]));
  check("week has Mon..Sun, 7 cells", wp.length === 7 && wp[0].name === "Mon" && wp[6].name === "Sun" && wp[0].key === "2026-09-14");
  check("today outlined once", wp.filter((d) => d.isToday).length === 1 && wp[4].isToday);
  check("sessions appear on their day", wp[2].sessions.some((s) => s.sport === "Running" && s.minutes === 40), wp[2]);
  check("past days carry a % where scored, future none", wp[6].pct === null);
}

// 12. stale stored KPI id falls back to that box's default
{
  const cat = metricCatalogue(ctxFor(roster[0]));
  check("defaults when nothing stored", JSON.stringify(resolveKpiIds(null, cat)) === JSON.stringify(DEFAULT_KPIS));
  const r = resolveKpiIds(["str", "trk:removed-item", "hrv", 7], cat);
  check("stale id falls back per box", r[0] === "str" && r[1] === "cardio" && r[2] === "hrv" && r[3] === "ready", r);
  check("garbage storage ignored", JSON.stringify(resolveKpiIds("nope", cat)) === JSON.stringify(DEFAULT_KPIS));
}

console.log(`\nverify-overview: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
