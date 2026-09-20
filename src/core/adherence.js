// Adherence percentages — Phase 6.
//
// THE ONE RULE IN THIS FILE: it never decides what "done" means.
//
// Every percentage here comes out of `buildHistoryRows()` in engine.js, the
// same function the client apps use to draw their own history. `isTaskDone()`
// exists precisely so there is one definition of done in the platform; a
// coach dashboard that reimplemented a narrower version would eventually
// disagree with the client's own screen, and there would be no way to tell
// which of the two was right. So this file only does three things:
//
//   1. reshape Supabase rows into the { 'YYYY-MM-DD': payload } structure
//      the engine expects,
//   2. decide which program version was in force on each day,
//   3. group the days by version, hand each group to the engine, and
//      summarise what comes back.
//
// Anything resembling a completion rule below is a bug.

import { buildHistoryRows } from "./engine.js";

/* ----------------------------- Row reshaping ----------------------------- */

/**
 * [{ day, payload }, …]  ->  { 'YYYY-MM-DD': payload }
 *
 * `day` is a Postgres `date`, which PostgREST serialises as 'YYYY-MM-DD' —
 * already the exact key format the engine uses. No Date object is constructed
 * here on purpose: `new Date('2026-09-06')` is midnight UTC, which is the
 * previous calendar day west of Greenwich, and every comparison in the engine
 * is local. The engine's own `toDate()` handles the conversion correctly.
 */
export function indexByDay(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    if (!r || typeof r.day !== "string") return;
    out[r.day] = r.payload && typeof r.payload === "object" ? r.payload : {};
  });
  return out;
}

/* -------------------------- Program versioning --------------------------- */

// `effective_from` is a Postgres date that can hold '-infinity', and PostgREST
// sends it as the literal string "-infinity" — not a date. `new Date()` on it
// yields Invalid Date, and comparing it lexicographically against '2026-08-01'
// only happens to work because '-' sorts below '0' in ASCII. That is an
// accident, not a design, so both infinities are handled explicitly.
function sortKey(effectiveFrom) {
  if (effectiveFrom === "-infinity") return Number.NEGATIVE_INFINITY;
  if (effectiveFrom === "infinity") return Number.POSITIVE_INFINITY;
  return String(effectiveFrom);
}

function startsOnOrBefore(effectiveFrom, dayStr) {
  const k = sortKey(effectiveFrom);
  if (k === Number.NEGATIVE_INFINITY) return true;
  if (k === Number.POSITIVE_INFINITY) return false;
  return k <= dayStr;
}

function compareVersions(a, b) {
  const ka = sortKey(a.effectiveFrom);
  const kb = sortKey(b.effectiveFrom);
  if (ka === kb) return 0;
  if (ka === Number.NEGATIVE_INFINITY) return -1;
  if (kb === Number.NEGATIVE_INFINITY) return 1;
  if (ka === Number.POSITIVE_INFINITY) return 1;
  if (kb === Number.POSITIVE_INFINITY) return -1;
  return ka < kb ? -1 : 1;
}

/**
 * programs rows -> { user_id: [version, …] } ascending by effective_from.
 *
 * Rows with no `assigned_to` are dropped, deliberately and loudly: an
 * unassigned program belongs to nobody, so there is no person whose days it
 * could score. Reporting that as "this client has no program" is correct.
 */
export function groupPrograms(programRows) {
  const byPerson = {};
  (programRows || []).forEach((r) => {
    if (!r || !r.assigned_to || !r.definition) return;
    if (!byPerson[r.assigned_to]) byPerson[r.assigned_to] = [];
    byPerson[r.assigned_to].push({
      rowId: r.id,
      name: r.name || r.id,
      effectiveFrom: r.effective_from,
      definition: r.definition,
    });
  });
  Object.keys(byPerson).forEach((k) => byPerson[k].sort(compareVersions));
  return byPerson;
}

/**
 * The program in force on `dayStr`: the version with the greatest
 * `effective_from <= dayStr`. Returns null when the person's first version
 * starts after that day — which is a real state, not an error, and must not
 * be silently scored against a later program.
 *
 * Today every row is '-infinity' so this always returns the single version.
 * That is exactly why it is written to handle the case that does not exist
 * yet: Phase 7 publishes new versions by inserting rows with later dates.
 */
export function resolveVersion(versions, dayStr) {
  let found = null;
  (versions || []).forEach((v) => {
    if (startsOnOrBefore(v.effectiveFrom, dayStr)) found = v; // ascending: last wins
  });
  return found;
}

/* ------------------------------- Adherence -------------------------------- */

/**
 * One person's days, scored.
 *
 * Days are grouped by the program version in force and each group is handed
 * to `buildHistoryRows()` whole, because that function takes one program for
 * the whole log it is given. Grouping — rather than calling it once per day —
 * keeps the engine doing what it was written to do.
 *
 * Returns { days, unscored, versionsUsed }. A day lands in `unscored` when no
 * program covers it; it is never given a 0% it did not earn.
 */
export function buildPersonAdherence(logRows, overrideRows, versions) {
  const log = indexByDay(logRows);
  const overrides = indexByDay(overrideRows);

  const groups = new Map(); // rowId -> { version, log }
  const unscored = [];

  Object.keys(log).forEach((dayStr) => {
    const version = resolveVersion(versions, dayStr);
    if (!version) {
      unscored.push(dayStr);
      return;
    }
    if (!groups.has(version.rowId)) groups.set(version.rowId, { version, log: {} });
    groups.get(version.rowId).log[dayStr] = log[dayStr];
  });

  const days = [];
  groups.forEach(({ version, log: groupLog }) => {
    const rows = buildHistoryRows(groupLog, overrides, version.definition);
    rows.forEach((row) => {
      days.push({
        date: row.date,
        dateObj: row.dateObj,
        total: row.total,
        doneCount: row.doneCount,
        // 0 of 0 is not 0% — it is "nothing was scheduled or tracked". The
        // engine returns pct 0 there, which would read as a failed day on a
        // dashboard. null keeps the distinction visible.
        pct: row.total ? row.doneCount / row.total : null,
        byCat: row.byCat,
        isTrainingDay: row.isTrainingDay,
        skip: row.skip || null,
        gentler: Boolean(row.gentler),
        programRowId: version.rowId,
        programName: version.name,
      });
    });
  });

  days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first
  unscored.sort().reverse();

  return {
    days,
    unscored,
    versionsUsed: [...groups.values()].map((g) => ({
      rowId: g.version.rowId,
      name: g.version.name,
      effectiveFrom: g.version.effectiveFrom,
      dayCount: Object.keys(g.log).length,
    })),
  };
}

/**
 * Averages across a set of scored days.
 *
 * Days with `pct === null` are excluded from every average rather than
 * counted as zero. Skip days are reported separately and excluded too: a
 * travel day the client deliberately cleared is not a day they failed, and
 * folding it into the mean would punish exactly the behaviour the skip
 * feature exists to record honestly.
 */
export function summarise(days, options) {
  const opt = options || {};
  const windowDays = opt.windowDays || null;

  let pool = days.filter((d) => d.pct != null && !d.skip);
  if (windowDays && pool.length) {
    const newest = days[0] ? days[0].dateObj : null;
    if (newest) {
      const cutoff = new Date(newest);
      cutoff.setDate(cutoff.getDate() - (windowDays - 1));
      pool = pool.filter((d) => d.dateObj >= cutoff);
    }
  }

  const catTotals = {};
  days
    .filter((d) => !d.skip)
    .forEach((d) => {
      Object.keys(d.byCat || {}).forEach((cat) => {
        if (!catTotals[cat]) catTotals[cat] = { total: 0, done: 0 };
        catTotals[cat].total += d.byCat[cat].total;
        catTotals[cat].done += d.byCat[cat].done;
      });
    });

  const byCat = {};
  Object.keys(catTotals)
    .sort()
    .forEach((cat) => {
      const c = catTotals[cat];
      byCat[cat] = { total: c.total, done: c.done, pct: c.total ? c.done / c.total : null };
    });

  return {
    scoredDays: pool.length,
    skipDays: days.filter((d) => d.skip).length,
    emptyDays: days.filter((d) => d.pct == null && !d.skip).length,
    avgPct: pool.length ? pool.reduce((s, d) => s + d.pct, 0) / pool.length : null,
    byCat,
  };
}

/**
 * The whole dashboard's worth: every person in the roster, scored.
 *
 * Takes the grouped `logs` and `overrides` that data.js already produces, so
 * the coach's own rows and a client's rows arrive here through the same
 * shape and are scored by the same code — the property data.js goes out of
 * its way to preserve.
 */
export function buildAllAdherence(roster, logsByUser, overridesByUser, programRows) {
  const programs = groupPrograms(programRows);
  const out = {};
  (roster || []).forEach((person) => {
    const versions = programs[person.id] || [];
    if (!versions.length) {
      out[person.id] = {
        days: [],
        unscored: Object.keys(indexByDay(logsByUser[person.id])).sort().reverse(),
        versionsUsed: [],
        summary: null,
        noProgram: true,
      };
      return;
    }
    const built = buildPersonAdherence(logsByUser[person.id], overridesByUser[person.id], versions);
    out[person.id] = {
      ...built,
      noProgram: false,
      summary: summarise(built.days),
      last30: summarise(built.days, { windowDays: 30 }),
    };
  });
  return out;
}

export function pctLabel(pct) {
  return pct == null ? "—" : Math.round(pct * 100) + "%";
}
