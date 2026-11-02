// verify-logweek — pure tests of src/core/logweek.js (Training log week grid + day card).
// Run: node verify-logweek.mjs
// Juha's fixture programmes and a hand-made week (fixtures/logweek-juha.mjs,
// Mon 28 Sep – Sun 4 Oct 2026). Every expected number below was worked out on
// paper; none is read back from the code under test.

import fs from "fs";
import { buildAllAdherence } from "./src/core/adherence.js";
import { logWeek, dayDetail, defaultDay, weekTitle, vsLastTime, toneFor, topSet, LOG_RULES } from "./src/core/logweek.js";
import { logs as weekLogs, overrides as weekOv } from "./fixtures/logweek-juha.mjs";

const JUHA = "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee";
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const programs = read("programs.json").filter((r) => r.assigned_to === JUHA);
const logRows = rows(weekLogs);
const ovRows = rows(weekOv);
const adh = buildAllAdherence([{ id: JUHA, name: "Juha" }], { [JUHA]: logRows }, { [JUHA]: ovRows }, programs);
const pctByDay = {};
adh[JUHA].days.forEach((d) => (pctByDay[d.date] = d));
const TODAY = new Date(2026, 9, 5); // Mon 5 Oct 2026

let passed = 0, failed = 0;
const check = (label, ok, detail) => {
  if (ok) passed++; else { failed++; console.log("  FAIL " + label + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

const week = logWeek({ weekStart: new Date(2026, 9, 1), logRows, overrideRows: ovRows, programRows: programs, pctByDay, today: TODAY });
const D = (k) => week.days.find((d) => d.day === "2026-" + k);

// ---------------------------------------------------------------- the week
check("week is Mon 28 Sep – Sun 4 Oct, seven days, Monday first", week.start === "2026-09-28" && week.end === "2026-10-04" && week.days.length === 7 && week.days[0].label === "MON 28" && week.days[6].label === "SUN 4", [week.start, week.end, week.days.map((d) => d.label)]);
check("title", weekTitle(week) === "Week 28 Sep – 4 Oct", weekTitle(week));
check("a week starting mid-week is moved back to its Monday", logWeek({ weekStart: new Date(2026, 9, 3), logRows, overrideRows: ovRows, programRows: programs, pctByDay, today: TODAY }).start === "2026-09-28");

// ---------------------------------------------------------------- per-day numbers
{
  const tue = D("09-29"), thu = D("10-01"), sat = D("10-03");
  check("Tue A: 7 of 10 exercises logged", tue.exercisesLogged === 7 && tue.exercisesPlanned === 10, [tue.exercisesLogged, tue.exercisesPlanned]);
  check("Tue A: 23 sets, 9,620 kg (4+4+3+3+3+3+3; 940+1600+2160+1500+1620+720+1080)", tue.sets === 23 && tue.volumeKg === 9620, [tue.sets, tue.volumeKg]);
  check("Tue: 8 of 11 mobility ticked", tue.mobility && tue.mobility.done === 8 && tue.mobility.total === 11, tue.mobility);
  check("Tue: 2,550 kcal is −150 against the 2,700 training-day target", tue.kcal === 2550 && tue.targets.cal === 2700 && tue.kcalDiff === -150, [tue.kcal, tue.targets, tue.kcalDiff]);
  check("Thu B: 9 of 11 logged, 27 sets, 14,220 kg", thu.exercisesLogged === 9 && thu.exercisesPlanned === 11 && thu.sets === 27 && thu.volumeKg === 14220, [thu.exercisesLogged, thu.sets, thu.volumeKg]);
  check("Sat C: 8 of 11, 26 sets, 7,597 kg", sat.exercisesLogged === 8 && sat.exercisesPlanned === 11 && sat.sets === 26 && sat.volumeKg === 7597, [sat.exercisesLogged, sat.sets, sat.volumeKg]);
  const fri = D("10-02");
  check("Fri rest day: 2,300 kcal is −50 against the 2,350 REST target", fri.kcal === 2300 && fri.targets.cal === 2350 && fri.kcalDiff === -50, [fri.targets, fri.kcalDiff]);
  check("Fri: 11 of 11 mobility, alcohol 2, knee 2, weigh 86.2", fri.mobility.done === 11 && fri.alcohol === 2 && fri.knee === 2 && fri.weigh === 86.2);
  check("Mon (older version, tennis day): training target 2,700, −270", D("09-28").targets.cal === 2700 && D("09-28").kcalDiff === -270 && D("09-28").version.id === "juha-2026-09-23", [D("09-28").version, D("09-28").kcalDiff]);
  check("version in force follows the date inside one week", ["09-28", "09-29", "09-30", "10-01", "10-03"].map((k) => D(k).version.id).join() === "juha-2026-09-23,juha-2026-09-29,juha-2026-09-29,juha-2026-10,juha-2026-10");
  check("protein targets 190 and diffs", D("09-29").protein === 180 && D("09-29").proteinDiff === -10 && D("09-30").proteinDiff === -30);
  check("note present only where one was written", D("09-29").note === "Felt strong today" && D("10-01").note === null);
  check("adherence is the existing pctByDay entry, not recomputed", D("09-29").adherence === pctByDay["2026-09-29"] && D("09-29").adherence.total > 0);
}

// ---------------------------------------------------------------- missing is null
{
  const sun = D("10-04"), mon = D("09-28");
  check("Sun (nothing but a weigh-in): sets, volume, kcal, protein, exercises are null, not 0", sun.sets === null && sun.volumeKg === null && sun.kcal === null && sun.protein === null && sun.exercisesLogged === null && sun.kcalDiff === null);
  check("Sun: tones are null where there is no value", sun.tone.kcal === null && sun.tone.protein === null && sun.tone.exercises === null);
  check("Mon (tennis): no strength block → exercises, sets, volume null", mon.exercisesLogged === null && mon.exercisesPlanned === null && mon.sets === null && mon.volumeKg === null);
  const future = logWeek({ weekStart: new Date(2026, 9, 5), logRows, overrideRows: ovRows, programRows: programs, pctByDay, today: TODAY }).days[0];
  check("a planned day nobody opened has null exercises / mobility / nutrition", future.hasLog === false && future.exercisesLogged === null && future.mobility === null && future.kcal === null && future.weigh === null && future.tone.exercises === null && future.tone.mobility === null);
  check("an unlogged planned day still shows its session", future.session.kind !== "cleared" && future.session.text.length > 0, future.session);
  const none = logWeek({ weekStart: new Date(2026, 5, 1), logRows: [], overrideRows: [], programRows: [], pctByDay: {}, today: TODAY });
  check("no programme and no data: every day is empty but renders", none.days.every((d) => d.session.text === "No programme" && d.sets === null && d.kcal === null) && none.totals.sets === null && none.totals.kcalAvg === null && none.totals.weighLast === null);
}

// ---------------------------------------------------------------- skip and cleared
{
  const sun = D("10-04"), sat = D("10-03");
  check("skip day: session is Cleared and the reason is kept", sun.session.kind === "cleared" && sun.session.text === "Cleared" && sun.skip === "travel", sun.session);
  const det = dayDetail({ day: "2026-10-04", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY });
  check("skip day card: title 'Cleared — travel', no exercise rows", det.title === "Cleared — travel" && det.rows.length === 0 && det.subtitle === null, [det.title, det.rows.length]);
  check("a cleared slot is named by its block: 'Zone 2 cleared'", sat.cleared.length === 1 && sat.cleared[0].label === "Zone 2" && dayDetail({ day: "2026-10-03", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY }).clearedSlots.join() === "Zone 2 cleared", sat.cleared);
  check("cleared cardio is counted for the week note", week.totals.cardioCleared.join() === "Sat", week.totals.cardioCleared);
}

// ---------------------------------------------------------------- colour rules
{
  const c = (k, v, t) => toneFor(k, v, t);
  const cal = 2700;
  check("calories: exactly +10 % and −10 % are on", c("calories", 2970, cal) === "on" && c("calories", 2430, cal) === "on");
  check("calories: one kcal past 10 % is off", c("calories", 2971, cal) === "off" && c("calories", 2429, cal) === "off");
  check("calories: 2,350 target, 235 either way is on, 236 off", c("calories", 2585, 2350) === "on" && c("calories", 2115, 2350) === "on" && c("calories", 2586, 2350) === "off");
  check("protein: at or over target is on", c("protein", 190, 190) === "on" && c("protein", 240, 190) === "on");
  check("protein: exactly 10 % below is neutral, past it is off", c("protein", 171, 190) === "neutral" && c("protein", 170.9, 190) === "off" && c("protein", 180, 190) === "neutral");
  check("mobility: exactly 60 % is on, below is neutral", c("mobility", { done: 6, total: 10 }) === "on" && c("mobility", { done: 59, total: 100 }) === "neutral");
  check("mobility: exactly 30 % is off, above is neutral", c("mobility", { done: 3, total: 10 }) === "off" && c("mobility", { done: 31, total: 100 }) === "neutral");
  check("mobility: 7/11 on, 3/11 off, 6/11 neutral", c("mobility", { done: 7, total: 11 }) === "on" && c("mobility", { done: 3, total: 11 }) === "off" && c("mobility", { done: 6, total: 11 }) === "neutral");
  check("exercises: exactly 80 % is on, 79 % is neutral", c("exercises", { logged: 8, planned: 10 }) === "on" && c("exercises", { logged: 79, planned: 100 }) === "neutral");
  check("exercises: exactly 70 % is neutral, below is off", c("exercises", { logged: 7, planned: 10 }) === "neutral" && c("exercises", { logged: 69, planned: 100 }) === "off");
  check("exercises: 9/10 on, 7/11 off", c("exercises", { logged: 9, planned: 10 }) === "on" && c("exercises", { logged: 7, planned: 11 }) === "off");
  check("alcohol: anything above 0 is off, 0 is not coloured", c("alcohol", 0.5) === "off" && c("alcohol", 2) === "off" && c("alcohol", 0) === "neutral");
  check("no value or no target → no tone", c("calories", null, 2700) === null && c("calories", 2500, null) === null && c("protein", null, 190) === null && c("mobility", { done: 0, total: 0 }) === null && c("exercises", { logged: 0, planned: 0 }) === null);
  check("weigh-in, knee and sets are never coloured", c("weigh", 90, 80) === null && c("knee", 4, 1) === null && c("sets", 30, 20) === null);
  check("all thresholds live in one exported object", Object.keys(LOG_RULES).sort().join() === "caloriesWithin,exercisesOff,exercisesOn,mobilityOff,mobilityOn,proteinLowBy");
  check("per-day tones follow the rules on the fixture week", D("09-29").tone.exercises === "neutral" && D("10-01").tone.exercises === "on" && D("10-03").tone.exercises === "neutral" && D("09-30").tone.kcal === "off" && D("10-03").tone.kcal === "on" && D("09-28").tone.kcal === "on" && D("09-30").tone.protein === "off" && D("09-29").tone.protein === "neutral" && D("10-02").tone.alcohol === "off" && D("09-30").tone.mobility === "off" && D("09-28").tone.mobility === "on" && D("10-01").tone.mobility === "neutral", week.days.map((d) => d.tone));
}

// ---------------------------------------------------------------- vs last time
{
  const logIdx = {
    "2026-09-01": { loads: { sq: [{ r: 8, w: 80 }, { r: 8, w: 85 }] } },
    "2026-09-08": { loads: { sq: [{ r: 8, w: 85 }, { r: 6, w: 85 }], bw: [{ r: 10, w: null }] } },
    "2026-09-12": { loads: { "sq::front-squat": [{ r: 8, w: 60 }] } }, // a substitution is not the exercise's own history
    "2026-09-15": { loads: { sq: [{ r: 5, w: 90 }] } },
  };
  const v = (id, day, sets) => vsLastTime(id, day, logIdx, sets);
  check("up in reps: 90 kg now vs 90 kg on 15 Sep is the same weight, so reps decide", v("sq", "2026-09-20", [{ r: 8, w: 90 }]).text === "▲ +3 reps" && v("sq", "2026-09-20", [{ r: 8, w: 90 }]).ref === "15 Sep: 5×90", v("sq", "2026-09-20", [{ r: 8, w: 90 }]));
  check("up in kg when the weight is higher", v("sq", "2026-09-20", [{ r: 5, w: 95 }]).text === "▲ +5 kg" && v("sq", "2026-09-20", [{ r: 5, w: 95 }]).dir === "up");
  check("same: identical top set is '='", v("sq", "2026-09-20", [{ r: 5, w: 90 }]).text === "=" && v("sq", "2026-09-20", [{ r: 5, w: 90 }]).dir === "same");
  check("down in kg", v("sq", "2026-09-20", [{ r: 8, w: 80 }]).text === "▼ −10 kg" && v("sq", "2026-09-20", [{ r: 8, w: 80 }]).dir === "down");
  check("down in reps at the same weight", v("sq", "2026-09-20", [{ r: 3, w: 90 }]).text === "▼ −2 reps");
  check("first log when nothing earlier has sets for that id", v("lunge", "2026-09-20", [{ r: 10, w: 20 }]).dir === "first" && v("lunge", "2026-09-20", [{ r: 10, w: 20 }]).text === "first log");
  check("only EARLIER days count: on 8 Sep it is compared with 1 Sep (top 8×85)", v("sq", "2026-09-08", [{ r: 8, w: 85 }, { r: 6, w: 85 }]).dir === "same" && v("sq", "2026-09-08", [{ r: 8, w: 85 }]).ref === "1 Sep: 8×85", v("sq", "2026-09-08", [{ r: 8, w: 85 }]));
  check("a substitution's sets are not the exercise's history (12 Sep ignored)", v("sq", "2026-09-14", [{ r: 8, w: 85 }]).ref === "8 Sep: 8×85");
  check("bodyweight: reps only", v("bw", "2026-09-20", [{ r: 12, w: null }]).text === "▲ +2 reps");
  check("no sets today → no comparison", v("sq", "2026-09-20", []) === null);
  check("top set is the heaviest, then the most reps", (() => { const t = topSet([{ r: 12, w: 22 }, { r: 8, w: 30 }, { r: 10, w: 30 }]); return t.w === 30 && t.r === 10; })());
  // on the real fixture week: Sat's db-bench (8×30) equals Tue's; calf-seated 15×45 is +5 kg on Thu's 15×40; OHP has no history
  const sat = dayDetail({ day: "2026-10-03", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY });
  const row = (id) => sat.rows.find((r) => r.id === id);
  check("fixture: db-bench Sat = Tue", row("db-bench").vs.dir === "same" && row("db-bench").vs.ref === "29 Sep: 8×30", row("db-bench").vs);
  check("fixture: calf raise Sat is ▲ +5 kg on Thu", row("calf-seated").vs.text === "▲ +5 kg" && row("calf-seated").vs.ref === "1 Oct: 15×40", row("calf-seated").vs);
  check("fixture: overhead press first log", row("ohp-barbell").vs.text === "first log");
}

// ---------------------------------------------------------------- day card model
{
  const sat = dayDetail({ day: "2026-10-03", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY });
  check("Sat title is the block label; the cleared Zone 2 is not part of it", sat.title === "Session C — Shoulders / Posterior Chain", sat.title);
  check("Sat subtitle: 8 of 11 logged · 1 ticked without sets · 2 not done", sat.subtitle === "8 of 11 exercises logged · 1 ticked without sets · 2 not done", sat.subtitle);
  check("Sat ticked / not done are named, in plain words", sat.ticked.join() === "Weighted side plank hip lift" && sat.notDone.join() === "Face pull,Weighted crunch", [sat.ticked, sat.notDone]);
  check("Sat exercise rows are in plan order with sets as given", sat.rows.map((r) => r.id).join() === "db-bench,row-cable,ohp-barbell,lo-3,calf-seated,curl-incline-db,press-closegrip-db,up-5" && sat.rows[0].sets.length === 4 && sat.rows[0].top.w === 30);
  const tue = dayDetail({ day: "2026-09-29", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY });
  check("Tue: ticked-without-sets and not-done are split correctly", tue.ticked.join() === "Dumbbell lateral raise" && tue.notDone.join() === "Seated calf raise,Hanging knee raise" && tue.subtitle === "7 of 10 exercises logged · 1 ticked without sets · 2 not done", [tue.ticked, tue.notDone, tue.subtitle]);
  const thu = dayDetail({ day: "2026-10-01", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY });
  const sub = thu.rows.find((r) => r.id === "curl-ezbar");
  check("substitution reads 'Cable curl' for the planned exercise, 'swap' for vs-last-time", sub && sub.name === "Cable curl" && sub.forName === "Ez-bar curl" && sub.vs.text === "swap", sub && [sub.name, sub.forName]);
  check("Thu: the substituted exercise counts as logged (9 of 11)", thu.subtitle.startsWith("9 of 11 exercises logged"), thu.subtitle);
  check("no raw ids in anything shown (rows, ticked, not done, cleared)", ![...thu.rows.map((r) => r.name + (r.forName || "")), ...thu.ticked, ...thu.notDone, ...sat.clearedSlots].some((t) => /^(up|lo|mob|row|db|leg|ab)-/.test(t)));
  check("weigh-in compared with yesterday", thu.prevWeigh && thu.prevWeigh.yesterday === true && near(thu.prevWeigh.diff, 0) && dayDetail({ day: "2026-10-02", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY }).prevWeigh.diff === -0.2);
  check("knee scale maximum comes from the programme", sat.kneeMax === 4);
  const mon = dayDetail({ day: "2026-09-28", logRows, overrideRows: ovRows, programRows: programs, names: {}, pctByDay, today: TODAY });
  check("a tennis day has no exercise table", mon.rows.length === 0 && mon.subtitle === null && /Tennis/.test(mon.title), mon.title);
  const noPlan = dayDetail({ day: "2026-10-03", logRows, overrideRows: ovRows, programRows: [], names: {}, pctByDay: {}, today: TODAY, history: false });
  check("with no programme the card still builds (no plan, no targets, no history)", noPlan.title === "Logged day" && noPlan.targets === null && noPlan.kcalDiff === null && noPlan.rows.every((r) => r.vs === null) && noPlan.rows.length === 8);
}

// ---------------------------------------------------------------- an older version
{
  const base = programs.find((r) => r.id === "juha-2026-09-29");
  const oldDef = JSON.parse(JSON.stringify(base.definition));
  oldDef.nutritionTargets = { training: { cal: 2500, protein: 180, carbs: 250, fat: 80 }, rest: { cal: 2200, protein: 180, carbs: 200, fat: 70 } };
  oldDef.blocks.strength.a.exercises = oldDef.blocks.strength.a.exercises.filter((e) => e.id === "db-bench" || e.id === "up-2");
  const newDef = JSON.parse(JSON.stringify(base.definition));
  const rowsV = [
    { id: "v1", name: "Old", assigned_to: JUHA, effective_from: "-infinity", definition: oldDef },
    { id: "v2", name: "New", assigned_to: JUHA, effective_from: "2026-10-01", definition: newDef },
  ];
  const lr = [
    { day: "2026-09-29", payload: { loads: { "db-bench": [{ r: 8, w: 30 }], "up-2": [{ r: 10, w: 40 }], "lo-1": [{ r: 12, w: 60 }] }, numbers: { "nut-cal": 2600, "nut-pro": 180 } } },
    { day: "2026-10-06", payload: { loads: { "db-bench": [{ r: 8, w: 32 }], "up-2": [{ r: 10, w: 40 }], "lo-1": [{ r: 12, w: 60 }] }, numbers: { "nut-cal": 2600, "nut-pro": 180 } } },
  ];
  const w = logWeek({ weekStart: new Date(2026, 8, 28), logRows: lr, overrideRows: [], programRows: rowsV, pctByDay: {}, today: TODAY });
  const old = w.days.find((d) => d.day === "2026-09-29");
  check("older version: 2 planned exercises, both logged (lo-1 is not in that version's plan)", old.exercisesPlanned === 2 && old.exercisesLogged === 2 && old.version.id === "v1", [old.exercisesPlanned, old.exercisesLogged]);
  check("older version: its own training target (2,500) and protein target (180)", old.targets.cal === 2500 && old.kcalDiff === 100 && old.proteinDiff === 0 && old.tone.protein === "on");
  check("older version: the sets of the exercise outside its plan still count toward sets/volume", old.sets === 3 && old.volumeKg === 240 + 400 + 720);
  const w2 = logWeek({ weekStart: new Date(2026, 9, 5), logRows: lr, overrideRows: [], programRows: rowsV, pctByDay: {}, today: TODAY });
  const nw = w2.days.find((d) => d.day === "2026-10-06");
  check("newer version: full A plan (10) and the 2,700 target", nw.exercisesPlanned === 10 && nw.exercisesLogged === 3 && nw.targets.cal === 2700 && nw.kcalDiff === -100 && nw.version.id === "v2", [nw.exercisesPlanned, nw.targets]);
  // the same exercise compares across a version change
  const det = dayDetail({ day: "2026-10-06", logRows: lr, overrideRows: [], programRows: rowsV, names: {}, pctByDay: {}, today: TODAY });
  check("vs last time crosses the version boundary (db-bench +2 kg on 29 Sep)", det.rows.find((r) => r.id === "db-bench").vs.text === "▲ +2 kg");
}

// ---------------------------------------------------------------- week totals
{
  const t = week.totals;
  check("3 strength sessions, 76 sets, 31,437 kg (9,620 + 14,220 + 7,597)", t.sessions === 3 && t.sets === 76 && t.volumeKg === 31437, [t.sessions, t.sets, t.volumeKg]);
  check("no cardio duration task declared → cardio minutes null, not 0", t.cardioMin === null);
  check("average kcal over the six days with calories = 15,050 / 6", near(t.kcalAvg, 15050 / 6) && t.kcalDays === 6, t.kcalAvg);
  check("kcal within ±10 %: 4 of 6 (Mon, Tue, Fri, Sat)", t.kcalOnTarget === 4 && t.kcalJudged === 6, [t.kcalOnTarget, t.kcalJudged]);
  check("protein: 4 of 6 on target; one low day (Wed 160)", t.proteinOn === 4 && t.proteinJudged === 6 && t.proteinTarget === 190 && t.proteinLow.length === 1 && t.proteinLow[0].label === "Wed" && t.proteinLow[0].value === 160, t.proteinLow);
  check("weigh-in 86.2 on Mon → 87.2 on Sun, +1.0", t.weighFirst.day === "2026-09-28" && t.weighFirst.value === 86.2 && t.weighLast.day === "2026-10-04" && t.weighLast.value === 87.2 && t.weighChange === 1, [t.weighFirst, t.weighLast, t.weighChange]);
  // cardio minutes from a declared duration task
  const def = JSON.parse(JSON.stringify(programs.find((r) => r.id === "juha-2026-10").definition));
  def.blocks.cardio.hard.cardio = { durationTaskId: "cv-dur" };
  const rowsC = [{ id: "c", name: "C", assigned_to: JUHA, effective_from: "-infinity", definition: def }];
  const lrC = [{ day: "2026-09-30", payload: { numbers: { "cv-dur": 45 } } }, { day: "2026-10-04", payload: { numbers: { "cv-dur": 30 } } }];
  const wc = logWeek({ weekStart: new Date(2026, 8, 28), logRows: lrC, overrideRows: [], programRows: rowsC, pctByDay: {}, today: TODAY });
  check("confirmed cardio minutes = the logged durations on the planned cardio days (45 + 30)", wc.totals.cardioMin === 75, wc.totals.cardioMin);
}

// ---------------------------------------------------------------- default day
{
  check("default day: today if it has data", defaultDay(logWeek({ weekStart: new Date(2026, 9, 5), logRows: [...logRows, { day: "2026-10-05", payload: { done: {} } }], overrideRows: ovRows, programRows: programs, pctByDay, today: TODAY }), TODAY) === "2026-10-05");
  check("default day: else the latest day in the week with data (Sun 4 Oct)", defaultDay(logWeek({ weekStart: new Date(2026, 9, 1), logRows, overrideRows: ovRows, programRows: programs, pctByDay, today: new Date(2026, 9, 6) }), new Date(2026, 9, 6)) === "2026-10-04");
  check("default day: null for a week with no data", defaultDay(logWeek({ weekStart: new Date(2026, 5, 1), logRows, overrideRows: ovRows, programRows: programs, pctByDay, today: TODAY }), TODAY) === null);
  check("today is flagged and future days are marked", logWeek({ weekStart: new Date(2026, 9, 5), logRows, overrideRows: ovRows, programRows: programs, pctByDay, today: TODAY }).days.map((d) => (d.isToday ? "T" : d.isFuture ? "F" : "p")).join("") === "TFFFFFF");
}

console.log(`\nverify-logweek: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
