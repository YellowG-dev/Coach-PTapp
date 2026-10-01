// overview.js — pure logic behind the client Overview (Coach redesign R1).
//
// No React, no Supabase, no Date.now(): `ctx.today` is injected, so every
// function here is testable under plain node.
//
// THE ONE RULE IN THIS FILE: never invent a number. No data is null, and the
// caller renders null as a dash with the note saying why. A real zero
// (connected, no runs) is 0.
//
// Every workout figure goes through recordedWorkouts() and then dedupe(), in
// that order: John's counting rule first, then one row per session.
//
// ctx = {
//   personName, today: Date,
//   logRows, overrideRows,           // [{ day, payload }]
//   programRows,                     // this person's rows: { id, name, effective_from, definition }
//   days, workouts, connections,     // this person's wearable rows
//   recovery,                        // buildRecovery() result or null
//   adherence,                       // buildAllAdherence()[id] or null
//   names,                           // buildNameMap() result
// }

import { dateKey, getWeekMonday } from "./dates.js";
import { resolveSchedule } from "./engine.js";
import { recordedWorkouts, dedupe, weeklyCardioMinutes } from "./cardio.js";
import { resolveForDate, slotOptionsFor, blocksFor } from "./program-schema.js";
import { indexByDay } from "./adherence.js";
import { collapseDays } from "./recovery.js";
import { labelFor } from "./shape.js";

export const DEFAULT_KPIS = ["adh", "cardio", "run", "ready"];
export const NO_PROGRAM_STUB = { slots: [], schedule: {} };

/* -------------------------------- helpers --------------------------------- */

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : null);
const round1 = (n) => Math.round(n * 10) / 10;
const fmt1 = (n) => round1(n).toFixed(1);

/** "7h12" from minutes. */
export function fmtSleepShort(minutes) {
  const m = Math.round(Number(minutes));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** "Strength training" from "strengthTraining". */
export function sportLabel(sport) {
  if (!sport) return "Workout";
  const s = String(sport).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "mm:ss" from minutes (may be fractional). */
export function fmtDuration(minutes) {
  const n = Number(minutes);
  if (minutes == null || isNaN(n)) return "—";
  const total = Math.round(n * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function programsSorted(ctx) {
  return (ctx.programRows || []).filter((r) => r && r.definition);
}

/** The programme row in force on `date`, or null. */
export function versionFor(ctx, date) {
  return resolveForDate(programsSorted(ctx), date);
}

function definitionFor(ctx, date) {
  const r = versionFor(ctx, date);
  return r ? r.definition : null;
}

/** Real, deduped workouts, newest first. */
export function realWorkouts(ctx) {
  const list = dedupe(
    recordedWorkouts(ctx.workouts)
      .slice()
      .sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0))
  );
  return list;
}

function hasWearable(ctx) {
  return (
    (ctx.connections || []).length > 0 || (ctx.days || []).length > 0 || (ctx.workouts || []).length > 0
  );
}

const NO_WEARABLE = "No wearable connection";

function scheduleOn(ctx, date) {
  const program = definitionFor(ctx, date);
  if (!program) return { program: null, info: null };
  return { program, info: resolveSchedule(date, "auto", indexByDay(ctx.overrideRows), program) };
}

/** The last 7 days incl. today as day keys, oldest first. */
function last7Keys(today) {
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(today, i - 6)));
}

/* -------------------------------- catalogue -------------------------------- */

const STATIC_GROUPS = [
  {
    group: "Training",
    items: [
      { id: "adh", short: "Adherence", label: "Adherence · this week" },
      { id: "cardio", short: "Cardio", label: "Cardio minutes · this week" },
      { id: "run", short: "Running", label: "Running km · 7 days" },
      { id: "str", short: "Strength", label: "Strength sessions · 7 days" },
      { id: "sess30", short: "Sessions", label: "Sessions · 30 days" },
    ],
  },
  {
    group: "Recovery",
    items: [
      { id: "ready", short: "Readiness", label: "Readiness" },
      { id: "sleep", short: "Sleep", label: "Sleep" },
      { id: "hrv", short: "HRV", label: "HRV" },
      { id: "rhr", short: "Resting HR", label: "Resting HR" },
      { id: "steps", short: "Steps", label: "Steps · latest day" },
    ],
  },
];

/** One entry per tracking item of the version in force today. */
export function trackingItems(def, names) {
  const t = (def && def.tracking) || {};
  const out = [];
  for (const kind of ["rates", "scales", "numbers"]) {
    if (!Array.isArray(t[kind])) continue;
    for (const raw of t[kind]) {
      const item = typeof raw === "string" ? { id: raw } : raw;
      if (!item || typeof item.id !== "string") continue;
      out.push({
        kind,
        id: item.id,
        label: item.label || labelFor(item.id, names),
        unit: item.unit || "",
        rollingTotal: item.rollingTotal || null,
      });
    }
  }
  return out;
}

export function metricCatalogue(ctx) {
  const groups = STATIC_GROUPS.map((g) => ({ group: g.group, items: g.items.map((i) => ({ ...i })) }));
  const def = definitionFor(ctx, ctx.today);
  const items = trackingItems(def, ctx.names).map((t) => ({ id: "trk:" + t.id, short: t.label, label: t.label }));
  if (items.length) groups.push({ group: "Daily checks · " + (ctx.personName || "client"), items });
  return groups;
}

/** Stored box choices → 4 valid ids; a missing or stale id falls back to that box's default. */
export function resolveKpiIds(stored, catalogue) {
  const valid = new Set();
  (catalogue || []).forEach((g) => g.items.forEach((i) => valid.add(i.id)));
  return DEFAULT_KPIS.map((dflt, n) => {
    const s = Array.isArray(stored) ? stored[n] : null;
    return typeof s === "string" && valid.has(s) ? s : dflt;
  });
}

/* --------------------------------- metrics --------------------------------- */

const m = (value, note, tone) => ({ value, note, tone });
const none = (note) => ({ value: null, note, tone: undefined });

function adhMetric(ctx) {
  const a = ctx.adherence;
  if (!a || a.noProgram) return none("No programme assigned");
  const from = dateKey(getWeekMonday(ctx.today));
  const to = dateKey(ctx.today);
  const days = a.days.filter((d) => d.date >= from && d.date <= to && d.pct != null && !d.skip);
  if (!days.length) return none("No scored days this week");
  const mean = days.reduce((s, d) => s + d.pct, 0) / days.length;
  return m(Math.round(mean * 100) + "%", `${days.length} day${days.length === 1 ? "" : "s"} scored`, mean >= 0.8 ? "good" : mean < 0.5 ? "warn" : undefined);
}

function cardioMetric(ctx) {
  const monday = getWeekMonday(ctx.today);
  const rows = programsSorted(ctx);
  if (!rows.length) return none("No programme assigned");
  const resolver = (d) => definitionFor(ctx, d) || NO_PROGRAM_STUB;
  // A week with no cardio block anywhere and no confirmed extra has no cardio
  // to total; 0 would read as "planned and missed".
  let declares = false;
  let extras = false;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const def = resolver(d);
    for (const slot of def.slots || []) {
      if (slot === "strength") continue;
      const blocks = blocksFor(def, slot);
      if (Object.values(blocks).some((b) => b && b.cardio)) declares = true;
    }
    const ov = indexByDay(ctx.overrideRows)[dateKey(d)];
    if (ov && Array.isArray(ov.activities) && ov.activities.some((a) => a && typeof a.durationMin === "number")) extras = true;
  }
  if (!declares && !extras) return none("No cardio in the programme");
  const total = weeklyCardioMinutes(monday, indexByDay(ctx.logRows), indexByDay(ctx.overrideRows), resolver);
  return m(`${Math.round(total)} min`, "Planned + confirmed extras");
}

function windowWorkouts(ctx, fromKey, toKey) {
  return realWorkouts(ctx).filter((w) => w.day >= fromKey && w.day <= toKey);
}

function runMetric(ctx) {
  if (!hasWearable(ctx)) return none(NO_WEARABLE);
  const keys = last7Keys(ctx.today);
  const runs = windowWorkouts(ctx, keys[0], keys[6]).filter((w) => w.sport === "running");
  const km = runs.reduce((s, w) => s + (num(Number(w.distance_km)) || 0), 0);
  return m(`${fmt1(km)} km`, `${runs.length} run${runs.length === 1 ? "" : "s"}`);
}

function strMetric(ctx) {
  // Window: last 7 days incl. today, minus days with no version in force.
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ctx.today, i - 6);
    if (versionFor(ctx, d)) days.push(d);
  }
  if (!days.length) return none("No programme in force");
  const keys = days.map(dateKey);
  const scored = {};
  ((ctx.adherence && ctx.adherence.days) || []).forEach((d) => (scored[d.date] = d));
  const watch = new Set(
    windowWorkouts(ctx, keys[0], keys[keys.length - 1])
      .filter((w) => w.sport === "strengthTraining")
      .map((w) => w.day)
  );
  // A day counts once, whether the app log, the watch or both say so.
  const done = keys.filter((k) => {
    const s = scored[k];
    const app = s && s.byCat && s.byCat.strength && s.byCat.strength.done > 0;
    return app || watch.has(k);
  }).length;
  const planned = days.filter((d) => {
    const { info } = scheduleOn(ctx, d);
    return info && info.slots.strength;
  }).length;
  const shortened = days.length < 7;
  const first = days[0];
  return m(String(done), `of ${planned} planned` + (shortened ? ` · since ${first.getDate()}.${first.getMonth() + 1}.` : ""));
}

function sess30Metric(ctx) {
  if (!hasWearable(ctx)) return none(NO_WEARABLE);
  const from = dateKey(addDays(ctx.today, -30));
  const list = windowWorkouts(ctx, from, dateKey(ctx.today));
  const minutes = Math.round(list.reduce((s, w) => s + (Number(w.duration_minutes) || 0), 0));
  return m(String(list.length), `${minutes} min total`);
}

const REC_FIELDS = {
  ready: { day: "readiness", avg: "readiness", fmt: (v) => String(Math.round(v)), diff: (d) => String(Math.abs(Math.round(d))) },
  sleep: { day: "sleep_minutes", avg: "sleep", fmt: fmtSleepShort, diff: (d) => fmtSleepShort(Math.abs(d)) },
  hrv: { day: "hrv", avg: "hrv", fmt: (v) => String(Math.round(v)), diff: (d) => String(Math.abs(Math.round(d))) },
  rhr: { day: "resting_hr", avg: "rhr", fmt: (v) => String(Math.round(v)), diff: (d) => String(Math.abs(Math.round(d))) },
};

function recoveryMetric(id, ctx) {
  const r = ctx.recovery;
  if (!r) return none("No wearable data");
  if (!r.latest) return none("No sleep or readiness readings yet");
  const f = REC_FIELDS[id];
  const v = num(Number(r.latest[f.day]));
  if (r.latest[f.day] == null || v == null) return none("Not in the latest reading · " + r.latest.day.slice(5));
  const avg = r.avg7 ? r.avg7[f.avg] : null;
  let note = "Latest · " + r.latest.day.slice(5);
  if (avg != null) {
    const diff = v - avg;
    const arrow = Math.round(diff) === 0 && id !== "sleep" ? "=" : diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
    note = arrow === "=" ? "= 7-day avg" : `${arrow} ${f.diff(diff)} vs 7-day avg`;
  }
  return m(f.fmt(v), note);
}

function stepsMetric(ctx) {
  const rows = collapseDays(ctx.days, ctx.personId || null);
  if (!rows.length) return none("No wearable data");
  const todayKey = dateKey(ctx.today);
  const row = rows.find((r) => r.day < todayKey);
  if (!row || row.steps == null) return none("No steps before today");
  const avg = ctx.recovery && ctx.recovery.avg7 ? ctx.recovery.avg7.steps : null;
  return m(Number(row.steps).toLocaleString("en-GB"), (avg != null ? `7-day avg ${Math.round(avg).toLocaleString("en-GB")}` : "Latest day") + " · " + row.day.slice(5));
}

function payloadsInWindow(ctx, keys) {
  const idx = indexByDay(ctx.logRows);
  return keys.map((k) => idx[k]).filter(Boolean);
}

function trackingMetric(trackId, ctx) {
  const def = definitionFor(ctx, ctx.today);
  const item = trackingItems(def, ctx.names).find((t) => t.id === trackId);
  if (!item) return none("Not tracked in the programme in force");
  const keys = last7Keys(ctx.today);
  const logged = payloadsInWindow(ctx, keys);

  if (item.kind === "numbers" && !item.rollingTotal) {
    const idx = indexByDay(ctx.logRows);
    const day = Object.keys(idx)
      .filter((k) => k <= dateKey(ctx.today) && num(idx[k].numbers && idx[k].numbers[trackId]) != null)
      .sort()
      .pop();
    if (!day) return none("Never logged");
    return m(`${idx[day].numbers[trackId]}${item.unit ? " " + item.unit : ""}`, "Logged " + day.slice(5));
  }
  if (!logged.length) return none("Nothing logged in 7 days");

  if (item.kind === "rates") {
    const ticked = logged.filter((p) => p.done && p.done[trackId] === true).length;
    return m(`${ticked} / 7 days`, "Ticked");
  }
  if (item.kind === "scales") {
    const vals = logged.map((p) => num(p.scales && p.scales[trackId])).filter((v) => v != null);
    if (!vals.length) return none("Nothing logged in 7 days");
    return m(fmt1(vals.reduce((a, b) => a + b, 0) / vals.length), `Mean of ${vals.length} day${vals.length === 1 ? "" : "s"}`);
  }
  const vals = logged.map((p) => num(p.numbers && p.numbers[trackId])).filter((v) => v != null);
  if (!vals.length) return none("Nothing logged in 7 days");
  const sum = vals.reduce((a, b) => a + b, 0);
  return m(`${round1(sum)}${item.unit ? " " + item.unit : ""}`, "7-day total");
}

/** { value, note, tone } for a catalogue id, or null when the id is unknown. */
export function computeMetric(id, ctx) {
  if (id === "adh") return adhMetric(ctx);
  if (id === "cardio") return cardioMetric(ctx);
  if (id === "run") return runMetric(ctx);
  if (id === "str") return strMetric(ctx);
  if (id === "sess30") return sess30Metric(ctx);
  if (REC_FIELDS[id]) return recoveryMetric(id, ctx);
  if (id === "steps") return stepsMetric(ctx);
  if (typeof id === "string" && id.startsWith("trk:")) return trackingMetric(id.slice(4), ctx);
  return null;
}

/* ------------------------------ this week grid ----------------------------- */

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mon–Sun of the ISO week containing today. */
export function weekPlan(ctx) {
  const monday = getWeekMonday(ctx.today);
  const todayKey = dateKey(ctx.today);
  const real = realWorkouts(ctx);
  const scored = {};
  ((ctx.adherence && ctx.adherence.days) || []).forEach((d) => (scored[d.date] = d));
  return DOW.map((name, i) => {
    const date = addDays(monday, i);
    const key = dateKey(date);
    const { program, info } = scheduleOn(ctx, date);
    const planned = [];
    if (program && info && !info.skip) {
      for (const slot of program.slots || []) {
        const value = info.slots[slot];
        if (!value) continue;
        const opt = slotOptionsFor(program, slot).find((o) => o.value === value);
        planned.push(opt ? opt.label : value);
      }
    }
    const s = scored[key];
    return {
      key,
      name,
      dayOfMonth: date.getDate(),
      isToday: key === todayKey,
      isPast: key < todayKey,
      skip: Boolean(info && info.skip),
      planned,
      sessions: real
        .filter((w) => w.day === key)
        .reverse()
        .map((w) => ({ sport: sportLabel(w.sport), minutes: Math.round(Number(w.duration_minutes) || 0) })),
      pct: key < todayKey && s && s.pct != null && !s.skip ? s.pct : null,
    };
  });
}

/* ------------------------------ recent sessions ----------------------------- */

export function recentSessions(ctx, limit = 8) {
  return realWorkouts(ctx)
    .slice(0, limit)
    .map((w) => ({
      day: w.day,
      sport: sportLabel(w.sport),
      duration: fmtDuration(w.duration_minutes),
      km: w.distance_km != null && !isNaN(Number(w.distance_km)) ? fmt1(Number(w.distance_km)) : "—",
      hr: w.hr_avg != null || w.hr_max != null ? `${w.hr_avg != null ? Math.round(w.hr_avg) : "—"} / ${w.hr_max != null ? Math.round(w.hr_max) : "—"}` : "—",
      vendor: w.vendor,
    }));
}

/* ------------------------------ recovery bars ------------------------------- */

const BAR_ROWS = [
  { id: "sleepH", label: "Sleep", unit: "h" },
  { id: "readiness", label: "Readiness", unit: "" },
  { id: "hrv", label: "HRV", unit: "" },
  { id: "rhr", label: "Resting HR", unit: "" },
];

/**
 * Seven calendar nights ending at the newest night in the series. A night
 * with no row is `null` (empty bar), never a zero.
 */
export function recoveryBars(recovery) {
  if (!recovery || !recovery.series || !recovery.series.length) return null;
  const series = recovery.series;
  const end = series[series.length - 1].day;
  const [y, mo, d] = end.split("-").map(Number);
  const byDay = {};
  series.forEach((p) => (byDay[p.day] = p));
  const nights = Array.from({ length: 7 }, (_, i) => dateKey(new Date(y, mo - 1, d - (6 - i))));
  return BAR_ROWS.map((row) => {
    const values = nights.map((k) => (byDay[k] && byDay[k][row.id] != null ? byDay[k][row.id] : null));
    const present = values.filter((v) => v != null);
    const latest = [...values].reverse().find((v) => v != null);
    return {
      ...row,
      nights,
      values,
      latest: latest == null ? null : latest,
      max: present.length ? Math.max(...present) : null,
    };
  });
}

/* ----------------------------- needs attention ------------------------------ */

function niceDay(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return `${DOW[(new Date(y, mo - 1, d).getDay() + 6) % 7]} ${d}.${mo}.`;
}

/**
 * Factual lines, only these rules. `ctx.draft` is `{ savedAt }` or absent.
 * Returns [{ id, text }].
 */
export function needsAttention(ctx) {
  const out = [];
  const nowMs = ctx.today.getTime();

  for (const c of ctx.connections || []) {
    if (c.status !== "connected") {
      out.push({ id: "conn:" + c.vendor, text: `${c.vendor} connection: ${c.status}` });
    } else if (c.last_synced_at) {
      const hours = (nowMs - Date.parse(c.last_synced_at)) / 3600000;
      if (hours > 48) out.push({ id: "conn:" + c.vendor, text: `${c.vendor} last synced ${Math.round(hours / 24)} d ago` });
    }
  }

  const def = definitionFor(ctx, ctx.today);
  if (def && def.usesHeartRate === true && !def.hrZones) {
    out.push({ id: "zones", text: "Heart rate is used but the programme has no zone table" });
  }

  const real = realWorkouts(ctx);
  const ovByDay = indexByDay(ctx.overrideRows);
  const todayKey = dateKey(ctx.today);
  const monday = getWeekMonday(ctx.today);
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const key = dateKey(date);
    if (key > todayKey) break;
    const { program, info } = scheduleOn(ctx, date);
    const ov = ovByDay[key] || {};
    const hasActivity = Array.isArray(ov.activities) && ov.activities.length > 0;
    const planned = (slot) => Boolean(program && info && info.slots[slot]);
    const anyNonStrength = Boolean(program && (program.slots || []).some((sl) => sl !== "strength" && planned(sl)));
    const matches = (w) => {
      if (w.sport === "strengthTraining") return planned("strength");
      const types = (program && Array.isArray(program.cardioTypes) ? program.cardioTypes : []).filter(
        (t) => Array.isArray(t.sports) && t.sports.includes(w.sport)
      );
      if (types.length) return types.some((t) => t.slot && planned(t.slot));
      // No mapping for this sport: unknown must not raise a false alarm.
      return anyNonStrength || hasActivity;
    };
    real
      .filter((w) => w.day === key)
      .filter((w) => !matches(w))
      .forEach((w) =>
        out.push({
          id: "unplanned:" + key + ":" + w.started_at,
          text: `Unplanned session · ${niceDay(key)} · ${sportLabel(w.sport)} ${Math.round(Number(w.duration_minutes) || 0)} min`,
        })
      );
  }

  if (ctx.draft && ctx.draft.savedAt) {
    out.push({ id: "draft", text: "Unpublished draft, saved " + String(ctx.draft.savedAt).slice(0, 10) });
  }

  const keys = [0, 1, 2].map((i) => dateKey(addDays(ctx.today, -i)));
  const logged = Object.keys(indexByDay(ctx.logRows)).sort();
  if (!keys.some((k) => logged.includes(k))) {
    out.push({
      id: "nolog",
      text: logged.length ? `No day logged since ${niceDay(logged[logged.length - 1])}` : "No day logged yet",
    });
  }
  return out;
}

/** Build a ctx for one person from the loaded data. Pure. */
export function buildPersonCtx(data, person, extras) {
  const w = (data && data.wearables) || {};
  return {
    personId: person.id,
    personName: person.name,
    logRows: ((data && data.logs) || {})[person.id] || [],
    overrideRows: ((data && data.overrides) || {})[person.id] || [],
    programRows: ((data && data.programs) || []).filter((r) => r.assigned_to === person.id),
    days: (w.days || {})[person.id] || [],
    workouts: (w.workouts || {})[person.id] || [],
    connections: (w.connections || []).filter((c) => c.user_id === person.id),
    ...extras,
  };
}
