// logweek.js — pure logic behind the Training log tab (Coach 0.12.2).
//
// One Monday–Sunday week, one column per day, plus the model of one day's card.
// No React, no Supabase, no Date.now(): `today` is injected.
//
// THE ONE RULE IN THIS FILE: never estimate. A value that is not in the log is
// `null`, and the screen shows "—". A real 0 (nothing ticked, no alcohol) is 0.
//
// What "done" means is not decided here. Adherence comes from `pctByDay`
// (core/adherence.js); the day's content comes from shapeDay (core/shape.js);
// the schedule from resolveSchedule (core/engine.js) against the programme
// version in force on that day (resolveForDate). This file only arranges them.

import { resolveSchedule } from "./engine.js";
import { weeklyCardioMinutes } from "./cardio.js";
import { shapeDay, labelFor } from "./shape.js";
import { indexByDay } from "./adherence.js";
import { dateKey, getISOWeek, getWeekMonday } from "./dates.js";
import { resolveForDate, blocksFor, slotMetaFor, mobilityFor, NON_CARDIO_SLOTS } from "./program-schema.js";

const NO_PROGRAM = { slots: [], schedule: {} };
const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* --------------------------------- colours --------------------------------- */

/**
 * Every threshold behind the on / off / neutral colouring, in one place so it
 * can be tuned later. Fractions are of the day's target (calories, protein) or
 * of the list / plan (mobility, exercises). Weigh-in, knee and sets / volume
 * are deliberately not coloured, and alcohol is off for anything above 0.
 */
export const LOG_RULES = {
  caloriesWithin: 0.1, // within ±10 % of the day's target → on, else off
  proteinLowBy: 0.1, // ≥ target → on; more than 10 % below → off; in between neutral
  mobilityOn: 0.6, // ≥ 60 % of the list → on
  mobilityOff: 0.3, // ≤ 30 % → off; in between neutral
  exercisesOn: 0.8, // ≥ 80 % of planned → on
  exercisesOff: 0.7, // < 70 % → off; in between neutral
};

const EPS = 1e-9;

/** "on" | "off" | "neutral", or null when there is no value (or no target) to judge. */
export function toneFor(kind, value, target) {
  const R = LOG_RULES;
  if (value == null) return null;
  switch (kind) {
    case "calories":
      if (target == null) return null;
      return Math.abs(value - target) <= target * R.caloriesWithin + EPS ? "on" : "off";
    case "protein":
      if (target == null) return null;
      if (value >= target) return "on";
      return value < target * (1 - R.proteinLowBy) - EPS ? "off" : "neutral";
    case "mobility": {
      // value = { done, total }
      if (!value.total) return null;
      const f = value.done / value.total;
      return f >= R.mobilityOn - EPS ? "on" : f <= R.mobilityOff + EPS ? "off" : "neutral";
    }
    case "exercises": {
      if (!value.planned) return null;
      const f = value.logged / value.planned;
      return f >= R.exercisesOn - EPS ? "on" : f < R.exercisesOff - EPS ? "off" : "neutral";
    }
    case "alcohol":
      return value > 0 ? "off" : "neutral";
    default:
      return null;
  }
}

/* --------------------------------- helpers --------------------------------- */

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (typeof v === "number" && !isNaN(v) ? v : null);

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

function parseKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "30 Sep" */
export const shortDate = (key) => {
  const d = parseKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** "Season ticket — Blue" → "Season ticket"; a label with no dash is kept whole. */
const shortLabel = (label) => String(label || "").split(/\s[—–-]\s/)[0].trim();

const hasSet = (s) => s && (s.w != null || s.r != null);

/** One exercise's logged sets (base plus any substitution's), nulls dropped. */
function loggedSets(ex) {
  return [...(ex.sets || []), ...(ex.variants || []).flatMap((v) => v.sets || [])].filter(hasSet);
}

/** Heaviest kg, then most reps; null for no sets. */
export function topSet(sets) {
  const list = (sets || []).filter(hasSet);
  if (!list.length) return null;
  return list.reduce((best, s) => {
    const bw = best.w ?? 0, sw = s.w ?? 0;
    return sw > bw || (sw === bw && (s.r ?? 0) > (best.r ?? 0)) ? s : best;
  });
}

/** "10×22" (reps × kg); a lone weight or lone reps still reads. */
export function setLabel(s) {
  if (!s) return "";
  if (s.w != null && s.r != null) return `${s.r}×${s.w}`;
  if (s.w != null) return `${s.w} kg`;
  return `${s.r} reps`;
}

/** Thousands separators, locale-independent. */
export const fmtNum = (n) => (n == null ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
export const signed = (n, digits = 0) => {
  if (n == null) return "—";
  const a = digits ? Math.abs(n).toFixed(digits) : fmtNum(Math.abs(n));
  return (n < 0 ? "−" : n > 0 ? "+" : "±") + a;
};

/** "MON 28" → "Mon" */
const dayName = (d) => d.label.slice(0, 1) + d.label.slice(1, 3).toLowerCase();

/* ------------------------------- vs last time ------------------------------- */

/**
 * Compare today's top set for `exId` with the most recent EARLIER logged day
 * that has sets for the same exercise id (its own sets, not a substitution's).
 * → { dir: "up" | "same" | "down" | "first", text, ref }
 */
export function vsLastTime(exId, dayKey, logIdx, todaySets) {
  const now = topSet(todaySets);
  if (!now) return null;
  const earlier = Object.keys(logIdx)
    .filter((k) => k < dayKey)
    .sort()
    .reverse();
  for (const k of earlier) {
    const loads = (logIdx[k] || {}).loads || {};
    const raw = loads[exId];
    const prev = topSet(
      (Array.isArray(raw) ? raw : []).map((e) => (typeof e === "number" ? { w: e, r: null } : { w: e && e.w != null ? e.w : null, r: e && e.r != null ? e.r : null }))
    );
    if (!prev) continue;
    const ref = `${shortDate(k)}: ${setLabel(prev)}`;
    const dw = (now.w ?? 0) - (prev.w ?? 0);
    const dr = (now.r ?? 0) - (prev.r ?? 0);
    const trim = (n) => String(Math.round(Math.abs(n) * 100) / 100);
    if (dw !== 0) return { dir: dw > 0 ? "up" : "down", text: `${dw > 0 ? "▲ +" : "▼ −"}${trim(dw)} kg`, ref };
    if (dr !== 0) return { dir: dr > 0 ? "up" : "down", text: `${dr > 0 ? "▲ +" : "▼ −"}${trim(dr)} reps`, ref };
    return { dir: "same", text: "=", ref };
  }
  return { dir: "first", text: "first log", ref: null };
}

/* ----------------------------------- day ----------------------------------- */

function envFor({ logRows, overrideRows, programRows }) {
  return {
    logIdx: indexByDay(logRows),
    ovIdx: indexByDay(overrideRows),
    versions: (programRows || []).filter((r) => r && r.definition),
  };
}

/** The shared per-day model; `week` and the day card both read it. */
function buildDay(date, env, pctByDay, todayKey) {
  const key = dateKey(date);
  const rec = Object.prototype.hasOwnProperty.call(env.logIdx, key) ? env.logIdx[key] : null;
  const version = resolveForDate(env.versions, date);
  const def = version ? version.definition : null;
  const weekType = (rec && rec.weekType) || (getISOWeek(date) % 2 === 0 ? "A" : "B");
  const info = def ? resolveSchedule(date, weekType, env.ovIdx, def) : null;
  const shaped = rec ? shapeDay(rec) : null;
  const meas = {};
  (shaped ? shaped.measurements : []).forEach((m) => (meas[m.id] = num(Number(m.value))));
  const rate = {};
  (shaped ? shaped.ratings : []).forEach((r) => (rate[r.id] = r.value));

  // ---- session
  const blocks = [];
  const cleared = [];
  if (def && info) {
    const base = typeof def.startDate === "string" && key < def.startDate ? {} : (def.schedule[weekType] || {})[date.getDay()] || {};
    for (const slot of def.slots) {
      const value = info.slots[slot];
      if (value) {
        const b = blocksFor(def, slot)[value];
        const label = (b && b.label) || value;
        blocks.push({ slot, value, label, short: shortLabel(label), color: slotMetaFor(def, slot).color, cat: (b && b.cat) || slot, block: b || null });
      } else if (info.moved[slot] && !info.skip && base[slot]) {
        const b = blocksFor(def, slot)[base[slot]];
        cleared.push({ slot, label: shortLabel((b && b.label) || base[slot]) });
      }
    }
  }
  const extras = info ? info.activities.filter((a) => a && a.name).map((a) => a.name) : [];
  // with no programme in force there is no schedule to resolve, but the override still says "skip"
  const ov = env.ovIdx[key];
  const skip = info ? info.skip : ov && typeof ov.skip === "string" && ov.skip ? ov.skip : null;
  let session;
  if (skip) session = { kind: "cleared", text: "Cleared", full: "Cleared", color: null };
  else if (blocks.length || extras.length) {
    const parts = [...blocks.map((b) => b.short), ...extras];
    session = { kind: "session", text: parts.join(" + "), full: [...blocks.map((b) => b.label), ...extras].join(" + "), color: blocks.length ? blocks[0].color : null };
  } else session = { kind: "none", text: def ? "No session" : "No programme", full: def ? "No session" : "No programme", color: null };

  // ---- strength exercises: planned from the version in force, logged from the log
  const strengthBlocks = blocks.filter((b) => b.cat === "strength" && b.block);
  const plannedList = strengthBlocks.flatMap((b) => (b.block.exercises || []).filter((e) => !e.type || e.type === "exercise").map((e) => ({ id: e.id, name: e.name })));
  const byId = {};
  (shaped ? shaped.exercises : []).forEach((e) => (byId[e.id] = e));
  const strength = strengthBlocks.length
    ? (() => {
        const logged = plannedList.filter((p) => byId[p.id] && loggedSets(byId[p.id]).length);
        const loggedIds = new Set(logged.map((p) => p.id));
        const done = (rec && rec.done) || {};
        const ticked = plannedList.filter((p) => !loggedIds.has(p.id) && done[p.id]);
        const tickedIds = new Set(ticked.map((p) => p.id));
        const notDone = rec ? plannedList.filter((p) => !loggedIds.has(p.id) && !tickedIds.has(p.id)) : [];
        return { planned: plannedList.length, logged: logged.length, ticked: ticked.map((p) => p.name), notDone: notDone.map((p) => p.name) };
      })()
    : null;

  // ---- sets and volume across everything logged that day
  let sets = 0;
  let volume = 0;
  (shaped ? shaped.exercises : []).forEach((e) =>
    loggedSets(e).forEach((s) => {
      sets += 1;
      if (s.w != null && s.r != null) volume += s.w * s.r;
    })
  );

  // ---- mobility
  const list = def ? mobilityFor(def) : [];
  const mobility = rec && list.length ? { done: list.filter((m) => rec.done && rec.done[m.id]).length, total: list.length } : null;

  // ---- nutrition against the day-type target
  const trainingDay = info ? info.isTrainingDay : null;
  const t = def && def.nutritionTargets && trainingDay != null ? def.nutritionTargets[trainingDay ? "training" : "rest"] : null;
  const targets = t ? { cal: num(t.cal), protein: num(t.protein), carbs: num(t.carbs), fat: num(t.fat) } : null;
  const kcal = meas["nut-cal"] ?? null;
  const protein = meas["nut-pro"] ?? null;
  // a day nobody opened has no "logged of planned" yet; that is missing, not 0
  const exercises = strength && rec ? { logged: strength.logged, planned: strength.planned } : null;

  const sc = pctByDay ? pctByDay[key] || null : null;
  return {
    day: key,
    date,
    dow: (date.getDay() + 6) % 7,
    label: `${DOW[(date.getDay() + 6) % 7]} ${date.getDate()}`,
    isToday: key === todayKey,
    isFuture: key > todayKey,
    hasLog: Boolean(rec),
    version: version ? { id: version.id, name: version.name } : null,
    def,
    session,
    blocks,
    cleared,
    extras,
    skip,
    strength,
    exercisesLogged: exercises ? exercises.logged : null,
    exercisesPlanned: exercises ? exercises.planned : null,
    sets: sets || null,
    volumeKg: sets ? volume : null,
    mobility,
    kcal,
    protein,
    carbs: meas["nut-carb"] ?? null,
    fat: meas["nut-fat"] ?? null,
    targets,
    kcalDiff: kcal != null && targets && targets.cal != null ? kcal - targets.cal : null,
    proteinDiff: protein != null && targets && targets.protein != null ? protein - targets.protein : null,
    weigh: meas["chk-weigh"] ?? null,
    knee: typeof rate["chk-knee"] === "number" ? rate["chk-knee"] : null,
    alcohol: meas["chk-alc-units"] ?? null,
    note: shaped && shaped.notes ? shaped.notes : null,
    adherence: sc,
    tone: {
      exercises: exercises ? toneFor("exercises", exercises) : null,
      mobility: mobility ? toneFor("mobility", mobility) : null,
      kcal: toneFor("calories", kcal, targets ? targets.cal : null),
      protein: toneFor("protein", protein, targets ? targets.protein : null),
      alcohol: toneFor("alcohol", meas["chk-alc-units"] ?? null),
    },
    _shaped: shaped,
    _rec: rec,
    _info: info,
  };
}

/* ----------------------------------- week ----------------------------------- */

/**
 * `weekStart` is a Monday (any date inside the week is moved back to it).
 * → { start, end, days: [7], totals }
 */
export function logWeek({ weekStart, logRows, overrideRows, programRows, pctByDay, today }) {
  const monday = getWeekMonday(weekStart);
  const todayKey = dateKey(today || new Date());
  const env = envFor({ logRows, overrideRows, programRows });
  const days = Array.from({ length: 7 }, (_, i) => buildDay(addDays(monday, i), env, pctByDay, todayKey));

  // ---- totals
  const withSets = days.filter((d) => d.sets);
  const sets = withSets.reduce((s, d) => s + d.sets, 0);
  const volume = withSets.reduce((s, d) => s + d.volumeKg, 0);

  // cardio: 0 would read as "planned and missed", so a week that neither
  // declares a cardio duration task nor has a cardio extra has no total
  const resolver = (d) => {
    const v = resolveForDate(env.versions, d);
    return v ? v.definition : NO_PROGRAM;
  };
  let declares = false;
  for (const d of days) {
    const def = d.def;
    if (!def) continue;
    for (const slot of def.slots || []) {
      if (NON_CARDIO_SLOTS.includes(slot)) continue;
      if (Object.values(blocksFor(def, slot)).some((b) => b && b.cardio && b.cardio.durationTaskId)) declares = true;
    }
  }
  const extrasCardio = days.some((d) => (d._info ? d._info.activities : []).some((a) => a && !NON_CARDIO_SLOTS.includes(a.kind) && typeof a.durationMin === "number"));
  const cardioMin = declares || extrasCardio ? weeklyCardioMinutes(monday, env.logIdx, env.ovIdx, resolver) : null;
  const cardioCleared = days.filter((d) => d.cleared.some((c) => !NON_CARDIO_SLOTS.includes(c.slot))).map(dayName);

  const kcalDays = days.filter((d) => d.kcal != null);
  const judged = days.filter((d) => d.tone.kcal);
  const protJudged = days.filter((d) => d.tone.protein);
  const weighs = days.filter((d) => d.weigh != null);
  const proteinTargets = [...new Set(days.map((d) => d.targets && d.targets.protein).filter((v) => v != null))];

  const totals = {
    sessions: withSets.length,
    sets: sets || null,
    volumeKg: sets ? volume : null,
    cardioMin,
    cardioCleared,
    kcalAvg: kcalDays.length ? kcalDays.reduce((s, d) => s + d.kcal, 0) / kcalDays.length : null,
    kcalDays: kcalDays.length,
    kcalOnTarget: judged.filter((d) => d.tone.kcal === "on").length,
    kcalJudged: judged.length,
    proteinTarget: proteinTargets.length === 1 ? proteinTargets[0] : null,
    proteinOn: protJudged.filter((d) => d.tone.protein === "on").length,
    proteinJudged: protJudged.length,
    proteinLow: protJudged.filter((d) => d.tone.protein === "off").map((d) => ({ day: d.day, label: dayName(d), value: d.protein })),
    weighFirst: weighs.length ? { day: weighs[0].day, value: weighs[0].weigh } : null,
    weighLast: weighs.length ? { day: weighs[weighs.length - 1].day, value: weighs[weighs.length - 1].weigh } : null,
    weighChange: weighs.length > 1 ? round2(weighs[weighs.length - 1].weigh - weighs[0].weigh) : null,
  };

  return { start: dateKey(monday), end: dateKey(addDays(monday, 6)), days, totals };
}

/** The day to show first: today if it has data, else the latest day with data; null if none. */
export function defaultDay(week, today) {
  const todayKey = dateKey(today || new Date());
  const t = week.days.find((d) => d.day === todayKey);
  if (t && t.hasLog) return t.day;
  const withData = week.days.filter((d) => d.hasLog);
  return withData.length ? withData[withData.length - 1].day : null;
}

/** "Week 28 Sep – 4 Oct" */
export function weekTitle(week) {
  return `Week ${shortDate(week.start)} – ${shortDate(week.end)}`;
}

/* ------------------------------- day card model ------------------------------ */

/**
 * Everything the day card shows, for one day. Works with no programme rows at
 * all (title "Logged day", no plan, no targets) so the card can still render.
 */
export function dayDetail({ day, logRows, overrideRows, programRows, names, pctByDay, today, history = true }) {
  const env = envFor({ logRows, overrideRows, programRows });
  const date = parseKey(day);
  const todayKey = dateKey(today || new Date());
  const d = buildDay(date, env, pctByDay, todayKey);
  const shaped = d._shaped;
  const rec = d._rec;

  // exercise rows: planned order first, then anything else with sets
  const planned = d.blocks.filter((b) => b.cat === "strength" && b.block).flatMap((b) => (b.block.exercises || []).map((e) => ({ id: e.id, name: e.name })));
  const order = new Map(planned.map((p, i) => [p.id, i]));
  const nameOf = (id) => (planned.find((p) => p.id === id) || {}).name || labelFor(id, names);
  const rows = (shaped ? shaped.exercises : [])
    .filter((e) => loggedSets(e).length)
    .map((e) => {
      const sets = loggedSets(e);
      const swapped = !(e.sets || []).some(hasSet) && e.variants.length > 0;
      const subName = e.sub ? e.sub.name : e.variants.length ? e.variants[0].label : null;
      return {
        id: e.id,
        name: swapped && subName ? subName : nameOf(e.id),
        forName: swapped ? nameOf(e.id) : null,
        sets,
        top: topSet(sets),
        // with `history: false` only this one day was supplied, so "first log" would be a guess
        vs: swapped ? { dir: "swap", text: "swap", ref: null } : history ? vsLastTime(e.id, day, env.logIdx, e.sets) : null,
        note: e.note || null,
      };
    })
    .sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e6) - (order.has(b.id) ? order.get(b.id) : 1e6));

  const prevWeigh = (() => {
    if (d.weigh == null) return null;
    for (const k of Object.keys(env.logIdx).filter((x) => x < day).sort().reverse()) {
      const s = shapeDay(env.logIdx[k]);
      const m = s.measurements.find((x) => x.id === "chk-weigh");
      if (m && num(Number(m.value)) != null) return { day: k, value: Number(m.value), yesterday: k === dateKey(addDays(date, -1)) };
    }
    return null;
  })();

  const kneeMax = (() => {
    const sc = d.def && d.def.tracking && Array.isArray(d.def.tracking.scales) ? d.def.tracking.scales.find((s) => s.id === "chk-knee") : null;
    return sc && num(sc.max);
  })();

  const checks = shaped ? shaped.checks.filter((id) => id !== "chk-weigh").map((id) => labelFor(id, names)) : [];

  let title;
  if (d.skip) title = `Cleared — ${d.skip}`;
  else if (d.session.kind === "session") title = d.session.full;
  else if (rows.length) title = "Logged day";
  else title = d.session.kind === "none" && d.def ? "No session" : d.hasLog ? "Logged day" : "Nothing logged";

  const s = d.strength;
  const subtitle = d.skip
    ? null
    : s
    ? `${s.logged} of ${s.planned} exercises logged${s.ticked.length ? ` · ${s.ticked.length} ticked without sets` : ""}${s.notDone.length ? ` · ${s.notDone.length} not done` : ""}`
    : rows.length
    ? `${rows.length} exercise${rows.length === 1 ? "" : "s"} logged`
    : null;

  return {
    ...d,
    weekdayName: WEEKDAYS[date.getDay()],
    weekdayShort: DOW[(date.getDay() + 6) % 7],
    dayNumber: date.getDate(),
    monthShort: MONTHS[date.getMonth()],
    title,
    subtitle,
    clearedSlots: d.cleared.map((c) => `${c.label} cleared`),
    rows,
    ticked: s ? s.ticked : [],
    notDone: s ? s.notDone : [],
    checks,
    kneeMax,
    prevWeigh: prevWeigh ? { ...prevWeigh, diff: round2(d.weigh - prevWeigh.value) } : null,
    gentler: Boolean(shaped && shaped.gentler),
    hasContent: Boolean(rec) && !(shaped && shaped.isEmpty),
  };
}
