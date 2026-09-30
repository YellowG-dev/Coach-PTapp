// Progress tab — the numbers behind each chart (Coach redesign R3).
// Pure: no React, no Date.now() except through `ctx.today`. engine.js does the
// heavy lifting (it is byte-identical to the client apps' copy, so a chart here
// reads the same as in the client's own Progress view); this file only wires
// Coach's data shapes into it.

import {
  buildHistoryRows,
  computeSeries,
  computeRollingTotal,
  computeLoadSeries,
  labelForLoadKey,
  dateKey,
} from "./engine.js";
import { indexByDay } from "./adherence.js";
import { collapseDays } from "./recovery.js";
import { labelFor } from "./shape.js";
import { versionFor, realWorkouts, sportLabel, NO_PROGRAM_STUB } from "./overview.js";

const mean = (vals) => {
  const v = vals.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function addDaysKey(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/* ----------------------------- recovery trends ----------------------------- */

const REC_CHARTS = [
  { id: "sleepH", title: "Sleep", unit: " h", avgKey: "sleep", scale: 1 / 60, digits: 1 },
  { id: "readiness", title: "Readiness", unit: "", avgKey: "readiness", digits: 0 },
  { id: "hrv", title: "HRV", unit: " ms", avgKey: "hrv", digits: 0 },
  { id: "rhr", title: "Resting HR", unit: " bpm", avgKey: "rhr", digits: 0 },
];

/**
 * Four small line charts and one bar chart, 30 calendar days ending at the
 * newest day in `recovery.series`. A night with no reading is `null` — a gap in
 * the line, never a zero. `avg7` is the mean of the readings in the seven days
 * up to and including that day (null when there are none).
 *
 * Returns null when there is no wearable data at all.
 */
export function recoveryTrends(recovery, wearableDays, subjectId) {
  if (!recovery || !recovery.series || !recovery.series.length) return null;
  const end = recovery.series[recovery.series.length - 1].day;
  const byDay = {};
  recovery.series.forEach((p) => (byDay[p.day] = p));
  const stepsByDay = {};
  collapseDays(wearableDays, subjectId || null).forEach((r) => {
    if (r.steps != null && !isNaN(Number(r.steps))) stepsByDay[r.day] = Number(r.steps);
  });

  const keys = Array.from({ length: 30 }, (_, i) => addDaysKey(end, i - 29));
  const label = (k) => k.slice(8) + "." + k.slice(5, 7);
  const build = (pick) => {
    const values = keys.map((k) => pick(k));
    return keys.map((k, i) => ({
      day: k,
      label: label(k),
      value: values[i],
      avg7: mean(values.slice(Math.max(0, i - 6), i + 1)),
    }));
  };
  const summary = (data, cfg, avg30) => {
    const last = [...data].reverse().find((d) => d.value != null);
    if (!last) return { latest: null, latestDay: null, vs30: null };
    const avg = avg30 == null ? null : avg30 * (cfg.scale || 1);
    return { latest: last.value, latestDay: last.day, vs30: avg == null ? null : last.value - avg };
  };

  const charts = REC_CHARTS.map((cfg) => {
    const data = build((k) => (byDay[k] && byDay[k][cfg.id] != null ? byDay[k][cfg.id] : null));
    return {
      id: cfg.id,
      title: cfg.title,
      unit: cfg.unit,
      digits: cfg.digits,
      kind: "line",
      data,
      ...summary(data, cfg, recovery.avg30 ? recovery.avg30[cfg.avgKey] : null),
    };
  });
  const stepData = build((k) => (stepsByDay[k] != null ? stepsByDay[k] : null));
  const steps = {
    id: "steps",
    title: "Steps",
    unit: "",
    digits: 0,
    kind: "bar",
    data: stepData,
    ...summary(stepData, { scale: 1 }, mean(keys.map((k) => stepsByDay[k]).filter((v) => v != null))),
  };
  return [...charts, steps];
}

/* ------------------------------ tracked items ------------------------------ */

// Client-side CATS palettes are client data and Coach does not carry them, so
// a card falls back to the same colour the client app uses when a tracking
// entry has no category: accent-2 for scales, accent for numbers.
const FALLBACK = { scales: "#4CB6C4", numbers: "#E3A23C", rates: "#8891A3" };

/**
 * Rows for one person, scored day by day against the version in force that
 * day (the resolver), today excluded — the same `trendRows` the client builds.
 */
export function trendRowsFor(ctx) {
  const log = indexByDay(ctx.logRows);
  const overrides = indexByDay(ctx.overrideRows);
  const resolver = (d) => {
    const v = versionFor(ctx, d);
    return (v && v.definition) || NO_PROGRAM_STUB;
  };
  const todayKey = dateKey(ctx.today);
  return buildHistoryRows(log, overrides, resolver).filter((r) => r.date !== todayKey);
}

/**
 * One chart card per `tracking` entry of the version in force today, built as
 * the client app's `trackedCharts` does (Juha-PTapp src/app.jsx):
 *   scales  → value + rolling average, fixed 1..max axis
 *   numbers → value + rolling average, or the weekly total when `rollingTotal`
 *   rates   → rolling hit-rate %
 * Last 60 points; entries with no data are left out.
 */
export function trackedCards(ctx, rows) {
  const v = versionFor(ctx, ctx.today);
  const t = (v && v.definition && v.definition.tracking) || {};
  const list = (x) => (Array.isArray(x) ? x : []);
  const norm = (spec) => (typeof spec === "string" ? { id: spec, label: spec } : spec);
  const recent = (arr) => arr.slice(-60);
  const out = [];

  for (const raw of list(t.scales)) {
    const cfg = norm(raw);
    if (!cfg || typeof cfg.id !== "string") continue;
    const data = recent(computeSeries(rows, cfg.id, { bucket: "scales", windowDays: cfg.rolling || 7 }));
    if (data.length) {
      out.push({
        id: cfg.id, title: cfg.label || cfg.id, data, unit: "", color: FALLBACK.scales, domain: [1, cfg.max || 5],
        note: `Grey dots are each day. The line is the ${cfg.rolling || 7}-day average — that is the one to read.`,
      });
    }
  }

  for (const raw of list(t.numbers)) {
    const cfg = norm(raw);
    if (!cfg || typeof cfg.id !== "string" || cfg.chart === false) continue;
    if (cfg.rollingTotal) {
      const data = recent(computeRollingTotal(rows, cfg.id, { windowDays: cfg.rollingTotal }));
      if (data.some((d) => d.value > 0)) {
        out.push({
          id: cfg.id, title: cfg.label || cfg.id, data, unit: cfg.unit ? ` ${cfg.unit}` : "", color: FALLBACK.numbers,
          kind: "total", totalWindow: cfg.rollingTotal, reference: cfg.reference, referenceLabel: cfg.referenceLabel,
          note: `Grey dots are each day. The line is the running ${cfg.rollingTotal}-day total — the figure worth watching.`,
        });
      }
      continue;
    }
    const data = recent(computeSeries(rows, cfg.id, { bucket: "numbers", windowDays: cfg.rolling || 7 }));
    if (data.length) {
      out.push({
        id: cfg.id, title: cfg.label || cfg.id, data, unit: cfg.unit ? ` ${cfg.unit}` : "", color: FALLBACK.numbers,
        domain: ["dataMin - 1", "dataMax + 1"],
        note: `Grey dots are each day. The line is the ${cfg.rolling || 7}-day average — that is the one to read.`,
      });
    }
  }

  for (const raw of list(t.rates)) {
    const cfg = norm(raw);
    if (!cfg || typeof cfg.id !== "string") continue;
    const data = recent(computeSeries(rows, cfg.id, { bucket: "done", windowDays: cfg.rolling || 7 }));
    if (data.length) {
      out.push({
        id: cfg.id, title: cfg.label || cfg.id, data, unit: "%", hideValue: true, color: FALLBACK.rates, domain: [0, 100],
        note: `How often it was ticked over a rolling ${cfg.rolling || 7} days — smooths out day-to-day noise.`,
      });
    }
  }
  return out;
}

/* ----------------------------- getting stronger ---------------------------- */

/** Exercises with at least one logged weight, alphabetical: [{ id, name }]. */
export function exercisesWithHistory(ctx) {
  const log = indexByDay(ctx.logRows);
  const found = new Set();
  Object.values(log).forEach((r) => {
    Object.entries((r && r.loads) || {}).forEach(([id, arr]) => {
      if ((arr || []).some((e) => e && e.w != null)) found.add(id);
    });
  });
  return [...found]
    .map((id) => ({ id, name: labelForLoadKey(id, (x) => labelFor(x, ctx.names)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Heaviest set per session for one exercise, today excluded, last 30. */
export function loadSeriesFor(ctx, exerciseId) {
  if (!exerciseId) return [];
  return computeLoadSeries(indexByDay(ctx.logRows), exerciseId, dateKey(ctx.today)).slice(-30);
}

/* ------------------------------- consistency ------------------------------- */

/**
 * Daily completion % over the last 60 days from the scored adherence days,
 * with a 7-day average. Skip days and days with nothing scheduled are not
 * scored, so they are absent rather than 0. Today is excluded (still open).
 */
export function consistencySeries(ctx) {
  const days = (ctx.adherence && ctx.adherence.days) || [];
  const todayKey = dateKey(ctx.today);
  const from = addDaysKey(todayKey, -60);
  const scored = days
    .filter((d) => d.pct != null && !d.skip && d.date >= from && d.date < todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return scored.map((d) => {
    const windowFrom = addDaysKey(d.date, -6);
    const win = scored.filter((x) => x.date >= windowFrom && x.date <= d.date).map((x) => x.pct * 100);
    return {
      date: d.date,
      label: d.date.slice(8) + "." + d.date.slice(5, 7),
      pct: Math.round(d.pct * 100),
      avg7: Math.round(mean(win)),
    };
  });
}

/* ------------------------------ sessions by sport --------------------------- */

const SPORT_COLOURS = ["#4CB6C4", "#E3A23C", "#7FB88F", "#C97388", "#A99BC9", "#8891A3"];
const SPORT_FIXED = { running: "#4CB6C4", strengthTraining: "#E3A23C", cycling: "#7FB88F", yoga: "#C97388", walking: "#8891A3" };

/** Same sport, same colour everywhere: a fixed few, the rest by a stable hash of the name. */
export function sportColour(sport) {
  if (SPORT_FIXED[sport]) return SPORT_FIXED[sport];
  let h = 0;
  for (const ch of String(sport)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPORT_COLOURS[h % SPORT_COLOURS.length];
}

/** Real, deduped workouts of the last 30 days: [{ sport, label, n, minutes, color }], most minutes first. */
export function sessionsBySport(ctx) {
  const from = addDaysKey(dateKey(ctx.today), -30);
  const by = {};
  realWorkouts(ctx)
    .filter((w) => w.day >= from && w.day <= dateKey(ctx.today))
    .forEach((w) => {
      const k = w.sport || "unknown";
      if (!by[k]) by[k] = { n: 0, minutes: 0 };
      by[k].n += 1;
      by[k].minutes += Number(w.duration_minutes) || 0;
    });
  return Object.entries(by)
    .map(([sport, v]) => ({ sport, label: sportLabel(sport), n: v.n, minutes: Math.round(v.minutes), color: sportColour(sport) }))
    .sort((a, b) => b.minutes - a.minutes);
}
