/**
 * verify-recovery.mjs — run with `node verify-recovery.mjs`.
 *
 * recovery.js had no coverage at all until now, which is how two defects sat in
 * it unnoticed. Neither is visible from the screen, because every number shown
 * is a real number belonging to somebody.
 *
 *   COLLAPSE — a person can hold two rows for one day as soon as a second vendor
 *              maps. Ville has Oura and Polar both connected. `buildRecovery`
 *              plotted both and resolved nothing, so the day read as whichever
 *              row Postgres happened to return first.
 *   AVERAGES — `avg7` and `avg30` took rows.slice(0, N), which is N array
 *              entries. With two vendors per day that is N/2 days.
 *
 * The same pair was fixed in the four client repos' src/core/wearables.js. The
 * two functions are deliberately NOT unified — this one is richer (steps,
 * avg30, bySport) and lives in a different repo — so each is tested where it is.
 *
 * Offline and dependency-free: recovery.js is pure, so it is imported directly.
 * Values are the ones from the live incident, so a failure reads like the bug.
 */
import assert from "assert";
import { buildRecovery, collapseDays, VENDOR_PREFERENCE, isRealSession } from "./src/core/recovery.js";

let checks = 0, failures = 0;
function ok(name, fn) {
  checks++;
  try { fn(); console.log(`  ok   ${name}`); }
  catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.message.split("\n")[0]}`); }
}

// Real readings. JUHA is the coach; the other two are the clients whose rows
// reached his own client app when its query was unfiltered.
const JUHA = "11111111-1111-1111-1111-111111111111";
const VILLE = "33333333-3333-3333-3333-333333333333";

const OWN = {
  "2026-09-27": { sleep_minutes: 401, readiness: 80, resting_hr: 51, hrv: 48, steps: 8400 },
  "2026-09-26": { sleep_minutes: 397, readiness: 83, resting_hr: 52, hrv: 46, steps: 7700 },
  "2026-09-25": { sleep_minutes: 412, readiness: 83, resting_hr: 50, hrv: 49, steps: 9100 },
  "2026-09-24": { sleep_minutes: 388, readiness: 78, resting_hr: 53, hrv: 44, steps: 6600 },
  "2026-09-23": { sleep_minutes: 361, readiness: 82, resting_hr: 51, hrv: 48, steps: 7200 },
  "2026-09-22": { sleep_minutes: 403, readiness: 57, resting_hr: 59, hrv: 29, steps: 5100 },
  "2026-09-21": { sleep_minutes: 430, readiness: 86, resting_hr: 49, hrv: 52, steps: 10200 },
  "2026-09-20": { sleep_minutes: 372, readiness: 74, resting_hr: 54, hrv: 41, steps: 4800 },
  "2026-09-19": { sleep_minutes: 419, readiness: 80, resting_hr: 50, hrv: 47, steps: 8800 },
  "2026-09-18": { sleep_minutes: 385, readiness: 76, resting_hr: 52, hrv: 45, steps: 7400 },
};
const DAYS_DESC = Object.keys(OWN).sort().reverse();
const row = (day, vendor, user_id, over = {}) => ({ day, vendor, user_id, ...OWN[day], ...over });
const POLAR_PLACEHOLDER = { sleep_minutes: 1, readiness: 1, resting_hr: 199, hrv: 1, steps: 1 };

/* -------------------------------- collapse -------------------------------- */

ok("two vendors on one day give ONE point for that day, and it is Oura's", () => {
  const days = [
    row("2026-09-27", "polar", VILLE, { readiness: 56, sleep_minutes: 300 }),
    row("2026-09-27", "oura", VILLE),
  ];
  const r = buildRecovery(days, [], VILLE);
  const points = r.series.filter((p) => p.day === "2026-09-27");
  assert.equal(points.length, 1, "a day with two vendor rows must plot once, not twice");
  assert.equal(points[0].readiness, 80, "Oura is the readiness source and must win the day");
  assert.equal(r.latest.vendor, "oura", "the latest night should read from Oura");
  assert.equal(r.nights, 1, "one day with two rows is one night, not two");
});

ok("Polar still carries a day Oura did not record", () => {
  const days = [row("2026-09-27", "oura", VILLE), row("2026-09-26", "polar", VILLE)];
  assert.equal(buildRecovery(days, [], VILLE).series.length, 2, "both days must survive");
  assert.equal(collapseDays(days, VILLE).find((d) => d.day === "2026-09-26").vendor, "polar",
    "the preference is an order, not an Oura-only filter");
});

ok("the vendor preference is data, and an unknown vendor sorts last", () => {
  assert.deepEqual(VENDOR_PREFERENCE, ["oura", "polar"]);
  const days = [row("2026-09-27", "whoop", VILLE, { readiness: 12 }), row("2026-09-27", "polar", VILLE)];
  assert.equal(collapseDays(days, VILLE)[0].vendor, "polar",
    "a vendor nobody has declared must not outrank a declared one");
});

ok("collapse is stable whichever order the rows arrive in", () => {
  const days = [row("2026-09-27", "polar", VILLE, { readiness: 56 }), row("2026-09-27", "oura", VILLE)];
  for (const ordered of [days, [...days].reverse()]) {
    assert.equal(buildRecovery(ordered, [], VILLE).series[0].readiness, 80,
      "the answer must not depend on the order Postgres returned");
  }
});

/* ------------------------- averages over days ----------------------------- */

ok("avg7 over 10 days with two vendors each averages 7 DAYS, not 7 rows", () => {
  const days = [];
  DAYS_DESC.forEach((d) => {
    days.push(row(d, "polar", VILLE, POLAR_PLACEHOLDER));
    days.push(row(d, "oura", VILLE));
  });
  const r = buildRecovery(days, [], VILLE);
  const first7 = DAYS_DESC.slice(0, 7);
  const want = (key) => first7.reduce((a, d) => a + OWN[d][key], 0) / 7;

  assert.equal(r.series.length, 10, "ten days of two-vendor rows are ten points");
  assert.equal(r.avg7.sleep, want("sleep_minutes"),
    "avg7 averaged rows, not days — with two vendors that is three and a half days");
  assert.equal(r.avg7.readiness, want("readiness"));
  assert.equal(r.avg7.rhr, want("resting_hr"));
  assert.equal(r.avg7.hrv, want("hrv"));
  assert.equal(r.avg7.steps, want("steps"));
  assert.notEqual(r.avg7.readiness, 1, "Polar's placeholder leaked into the average");
});

ok("avg30 averages 30 DAYS, not 30 rows", () => {
  // Twenty days, both vendors each: 40 rows. The old slice(0, 30) took fifteen
  // days and half of them Polar.
  const wanted = 20;
  const dayKey = (n) => {
    const d = new Date(Date.UTC(2026, 8, 27));
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const days = [];
  for (let n = 0; n < wanted; n++) {
    const readiness = 60 + n; // distinct per day, so a miscount shows in the mean
    days.push({ day: dayKey(n), vendor: "polar", user_id: VILLE, ...POLAR_PLACEHOLDER });
    days.push({ day: dayKey(n), vendor: "oura", user_id: VILLE, readiness, sleep_minutes: 360 + n, resting_hr: 50, hrv: 45, steps: 8000 });
  }
  const r = buildRecovery(days, [], VILLE);
  let sum = 0;
  for (let n = 0; n < wanted; n++) sum += 60 + n;
  assert.equal(r.series.length, 20, "twenty days of two-vendor rows are twenty points");
  assert.equal(r.avg30.readiness, sum / wanted, "avg30 counted rows rather than days");
  assert.equal(r.avg7.readiness, (60 + 61 + 62 + 63 + 64 + 65 + 66) / 7);
});

ok("a gap in the days does not shorten the 7-day window to fewer readings", () => {
  const kept = ["2026-09-27", "2026-09-26", "2026-09-24", "2026-09-22", "2026-09-21", "2026-09-19", "2026-09-18"];
  const days = kept.map((d) => row(d, "oura", VILLE));
  const want = kept.reduce((a, d) => a + OWN[d].readiness, 0) / kept.length;
  assert.equal(buildRecovery(days, [], VILLE).avg7.readiness, want,
    "avg7 is the last seven days that HAVE a reading");
});

/* --------------------- defence in depth on identity ----------------------- */

ok("defence in depth: a second person's row cannot outrank the subject's own row for that day", () => {
  // data.js groups every visible person's rows by user_id before they reach
  // here, so this should be unreachable. It is pinned anyway: the grouping is
  // the only thing keeping two people apart, and it was exactly this kind of
  // unreachable-by-reasoning that produced the client-app bug.
  const days = [
    { day: "2026-09-27", vendor: "oura", user_id: JUHA, sleep_minutes: 300, readiness: 56, resting_hr: 58, hrv: 33 },
    row("2026-09-27", "oura", VILLE),
  ];
  for (const ordered of [days, [...days].reverse()]) {
    const r = buildRecovery(ordered, [], VILLE);
    assert.equal(r.series.length, 1);
    assert.equal(r.series[0].readiness, 80, "the subject's own row must keep its day");
  }
});

ok("with no subject named, the vendor preference decides alone", () => {
  const days = [row("2026-09-27", "polar", VILLE, { readiness: 56 }), row("2026-09-27", "oura", VILLE)];
  const r = buildRecovery(days, []);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].readiness, 80);
});

/* ------------------ a missing day stays missing, and sessions ------------- */

ok("a day with a reading from neither vendor stays absent — never zero, never interpolated", () => {
  const days = [
    row("2026-09-27", "oura", VILLE),
    { day: "2026-09-26", vendor: "oura", user_id: VILLE, steps: 900 }, // today-from-midnight shape
    row("2026-09-25", "oura", VILLE),
  ];
  const r = buildRecovery(days, [], VILLE);
  const blank = r.series.find((p) => p.day === "2026-09-26");
  assert.equal(blank.sleepH, null, "a night with no reading must be null, not 0");
  assert.equal(blank.readiness, null);
  assert.equal(blank.hrv, null);
  assert.equal(blank.rhr, null);
  assert.equal(r.nights, 2, "the blank day is not a night");
  assert.equal(r.series.find((p) => p.day === "2026-09-24"), undefined,
    "a day absent from the data must stay absent, not be filled in");
  assert.equal(r.latest.day, "2026-09-27");
  assert.equal(buildRecovery([], [], VILLE), null, "no data at all gives nothing to render");
});

ok("only deliberate training counts as a session, and the collapse did not disturb that", () => {
  const today = new Date().toISOString().slice(0, 10);
  const workouts = [
    { vendor: "oura", source: "confirmed", sport: "houseWork", day: today, duration_minutes: 20 },
    { vendor: "oura", source: "workout_heart_rate", sport: "strengthTraining", day: today, duration_minutes: 75 },
    { vendor: "polar", source: null, sport: "running", day: today, duration_minutes: 40 },
  ];
  assert.equal(isRealSession(workouts[0]), false);
  const r = buildRecovery([row("2026-09-27", "oura", VILLE)], workouts, VILLE);
  assert.equal(r.sessions30, 2, "housework is not training");
  assert.equal(r.sessionMinutes30, 115);
  assert.deepEqual(r.bySport.map((s) => s.sport), ["strengthTraining", "running"]);
});

ok("confirmed Oura sports count, confirmed housework and short walks do not (rule of 29 Sep 2026)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const run = { vendor: "oura", source: "confirmed", sport: "running", day: today, duration_minutes: 49 };
  const chores = { vendor: "oura", source: "confirmed", sport: "houseWork", day: today, duration_minutes: 16 };
  assert.equal(isRealSession(run), true, "a confirmed 49-min run counts");
  assert.equal(isRealSession(chores), false, "a confirmed 16-min housework does not");
  const r = buildRecovery([row("2026-09-27", "oura", VILLE)], [run, chores], VILLE);
  assert.equal(r.sessions30, 1);
  assert.equal(r.sessionMinutes30, 49);
});

console.log(`\n${checks - failures}/${checks} checks passed.`);
console.log(`\nverify-recovery: ${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
