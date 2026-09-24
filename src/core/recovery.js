// Turning wearable rows into the few numbers a coach actually acts on.
//
// Two decisions live here rather than in the component.
//
// First, what counts as a session. Oura's workout collection is mostly
// auto-detected daily activity — on one real account, 331 of 385 rows were
// walking, housework and yardwork, all with source "confirmed". Only
// "workout_heart_rate" and "manual" are deliberate training. Polar rows have no
// source field and are all real sessions, so they pass through untouched.
//
// Second, nothing here invents a number. A missing night is null and renders as
// a dash; it is never a zero, and never interpolated from its neighbours. A
// coach reading a 0 h night would draw a conclusion the data does not support.

export function isRealSession(w) {
  if (!w) return false;
  if (w.vendor === "oura") return w.source === "workout_heart_rate" || w.source === "manual";
  return true;
}

function mean(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null).map(Number).filter((v) => !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** "7 h 12 m" from minutes, or a dash. */
export function fmtSleep(minutes) {
  if (minutes == null) return "—";
  const m = Math.round(Number(minutes));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
}

export function fmtNum(v, digits = 0, suffix = "") {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return (digits ? n.toFixed(digits) : String(Math.round(n))) + suffix;
}

/**
 * One person's recovery picture.
 * `days` and `workouts` are that person's rows, any vendor, unsorted.
 */
export function buildRecovery(days, workouts) {
  const rows = [...(days || [])].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)); // newest first
  if (!rows.length && !(workouts || []).length) return null;

  // The most recent night that actually has a sleep reading — not simply the
  // newest row, because today's row exists from midnight with steps only.
  const latest = rows.find((r) => r.sleep_minutes != null || r.readiness != null) || null;
  const last7 = rows.slice(0, 7);
  const last30 = rows.slice(0, 30);

  const series = rows
    .slice(0, 30)
    .reverse()
    .map((r) => ({
      day: r.day,
      label: r.day.slice(8) + "." + r.day.slice(5, 7),
      sleepH: r.sleep_minutes != null ? Math.round((Number(r.sleep_minutes) / 60) * 10) / 10 : null,
      readiness: r.readiness != null ? Number(r.readiness) : null,
      hrv: r.hrv != null ? Number(r.hrv) : null,
      rhr: r.resting_hr != null ? Number(r.resting_hr) : null,
    }));

  const sessions = (workouts || []).filter(isRealSession);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const recent = sessions.filter((w) => w.day >= cutoffKey);

  const bySport = {};
  recent.forEach((w) => {
    const k = w.sport || "unknown";
    if (!bySport[k]) bySport[k] = { n: 0, minutes: 0 };
    bySport[k].n += 1;
    bySport[k].minutes += Number(w.duration_minutes || 0);
  });

  return {
    latest,
    series,
    avg7: {
      sleep: mean(last7, "sleep_minutes"),
      readiness: mean(last7, "readiness"),
      rhr: mean(last7, "resting_hr"),
      hrv: mean(last7, "hrv"),
      steps: mean(last7, "steps"),
    },
    avg30: {
      sleep: mean(last30, "sleep_minutes"),
      readiness: mean(last30, "readiness"),
      rhr: mean(last30, "resting_hr"),
      hrv: mean(last30, "hrv"),
      steps: mean(last30, "steps"),
    },
    nights: rows.filter((r) => r.sleep_minutes != null).length,
    sessions30: recent.length,
    sessionMinutes30: Math.round(recent.reduce((a, w) => a + Number(w.duration_minutes || 0), 0)),
    bySport: Object.entries(bySport)
      .map(([sport, v]) => ({ sport, ...v }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6),
  };
}

/**
 * How a connection should read in the header line. A row that exists but has
 * never synced is a different state from no row at all, and both differ from a
 * connection that has gone stale — say so rather than showing a green tick for
 * all three.
 */
export function connectionLabel(conn) {
  if (!conn) return { text: "not connected", tone: "quiet" };
  if (conn.status === "needs_reauth") return { text: "needs reconnecting", tone: "warn" };
  if (conn.status === "error") return { text: "error", tone: "warn" };
  if (!conn.last_synced_at) return { text: "connected, no sync yet", tone: "quiet" };
  const hours = (Date.now() - Date.parse(conn.last_synced_at)) / 3600000;
  if (hours > 48) return { text: `last sync ${Math.round(hours / 24)} d ago`, tone: "warn" };
  return { text: `synced ${hours < 1 ? "just now" : Math.round(hours) + " h ago"}`, tone: "good" };
}
