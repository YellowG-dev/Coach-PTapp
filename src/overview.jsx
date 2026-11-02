// Overview tab — one client at a glance (Coach redesign R1).
// All numbers come from core/overview.js; this file only lays them out.

import React, { useState, useCallback } from "react";
import { pctLabel } from "./core/adherence.js";
import {
  metricCatalogue,
  computeMetric,
  resolveKpiIds,
  weekPlan,
  recentSessions,
  recoveryBaseline,
  fmtBaselineValue,
  fmtBaselineDelta,
  WEEK_NIGHTS,
  BASELINE_MIN,
  needsAttention,
} from "./core/overview.js";
import { THEME as T, FONT_DISPLAY, FONT_MONO } from "./config.jsx";

const kpiKey = (personId) => `coachKpis_${personId}`;

function readKpis(personId) {
  try {
    const raw = window.localStorage.getItem(kpiKey(personId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeKpis(personId, ids) {
  try {
    window.localStorage.setItem(kpiKey(personId), JSON.stringify(ids));
  } catch (e) {
    /* works without storage */
  }
}

function Card({ title, children, className }) {
  return (
    <section
      style={{ background: T.card, borderColor: T.border }}
      className={"rounded-xl border px-4 py-3 min-w-0 " + (className || "")}
    >
      {title && (
        <h3 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-sm font-bold mb-2">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

const RECOVERY_IDS = new Set(["ready", "sleep", "hrv", "rhr", "steps"]);

function MetricBox({ n, personId, ids, catalogue, ctx, onChange }) {
  const id = ids[n];
  const metric = computeMetric(id, ctx);
  const item = catalogue.flatMap((g) => g.items).find((i) => i.id === id);
  const valueColour = !metric || metric.value == null ? T.textMuted : T.textPrimary;
  // Note line by tone (A1): good / warn from the metric, Oura-style recovery
  // items teal, everything else neutral.
  const noteColour =
    metric && metric.tone === "good" ? T.good
    : metric && metric.tone === "warn" ? T.warn
    : RECOVERY_IDS.has(id) ? T.accentAlt
    : T.textSecondary;
  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-xl border px-4 py-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span style={{ color: T.textSecondary }} className="text-[11px] uppercase tracking-wide truncate">
          {item ? item.short : id}
        </span>
        <select
          aria-label={`Choose what box ${n + 1} shows`}
          value={id}
          onChange={(e) => onChange(n, e.target.value)}
          style={{ background: T.bg, color: T.textSecondary, borderColor: T.border }}
          className="text-[11px] rounded-md border px-1 py-0.5 max-w-[45%] focus:outline-none focus-visible:ring-2"
        >
          {catalogue.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <p style={{ fontFamily: FONT_MONO, color: valueColour }} className="text-3xl font-semibold leading-none mt-3">
        {metric && metric.value != null ? metric.value : "—"}
      </p>
      <p style={{ color: noteColour }} className="text-[11px] mt-2">
        {metric ? metric.note : "Unknown metric"}
      </p>
    </div>
  );
}

// Cell state → colours, from the A1 design.
function dayState(d) {
  if (d.skip) return "skip";
  if (d.isToday) return "today";
  if (!d.isPast) return "plan";
  if (d.sessions.length > 0 || (d.pct != null && d.pct > 0)) return "done";
  return "quiet";
}

const CELL = {
  done: { bg: T.doneBg, border: `1px solid ${T.doneBorder}`, word: "Done", wordColour: T.good },
  today: { bg: T.bg, border: `1px solid ${T.accent}`, word: "Today", wordColour: T.accent },
  plan: { bg: T.bg, border: `1px dashed ${T.borderStrong}`, word: "Planned", wordColour: T.textSecondary },
  skip: { bg: T.bg, border: `1px solid ${T.border}`, word: "Skip", wordColour: T.textMuted, opacity: 0.75 },
  quiet: { bg: T.bg, border: `1px solid ${T.border}`, word: null, wordColour: T.textMuted },
};

function WeekGrid({ ctx }) {
  const week = weekPlan(ctx);
  return (
    <Card title="This week · planned vs done" className="lg:col-span-2">
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const state = dayState(d);
          const c = CELL[state];
          const word = state === "quiet" ? (d.planned.length ? "Not logged" : null) : c.word;
          return (
            <div
              key={d.key}
              data-day={d.key}
              data-state={state}
              style={{ background: c.bg, border: c.border, opacity: c.opacity || 1 }}
              className="rounded-[10px] px-1.5 py-2 min-w-0 min-h-[96px] flex flex-col"
            >
              <p style={{ color: d.isToday ? T.accent : T.textSecondary }} className="text-[10px] uppercase tracking-wide">
                {d.name} {d.dayOfMonth}
              </p>
              {d.planned.map((p) => (
                <p key={p} style={{ color: T.textPrimary }} className="text-[11px] mt-1 leading-tight break-words">
                  {p}
                </p>
              ))}
              {d.sessions.map((s, i) => (
                <p key={i} style={{ color: T.good, fontFamily: FONT_MONO }} className="text-[10px] mt-1 leading-tight break-words">
                  ✓ {s.sport} {s.minutes}′
                </p>
              ))}
              {d.pct != null && (
                <p style={{ color: T.textMuted, fontFamily: FONT_MONO }} className="text-[10px] mt-1">
                  {pctLabel(d.pct)}
                </p>
              )}
              {word && (
                <p style={{ color: c.wordColour }} className="text-[11px] font-semibold mt-auto pt-1">
                  {word}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const ATTENTION_DOT = { conn: T.warn, zones: T.textSecondary, unplanned: T.accentAlt, draft: T.accent, nolog: T.warn };
const attentionKind = (id) => String(id).split(":")[0];

function Attention({ ctx }) {
  const items = needsAttention(ctx);
  return (
    <Card title="Needs attention">
      {items.length === 0 ? (
        <p style={{ color: T.textMuted }} className="text-xs">
          Nothing needs attention.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} style={{ color: T.textSecondary }} className="text-xs flex items-start gap-2">
              <span
                aria-hidden="true"
                data-dot={attentionKind(i.id)}
                style={{ background: ATTENTION_DOT[attentionKind(i.id)] || T.textSecondary }}
                className="inline-block w-2.5 h-2.5 rounded-full mt-[3px] shrink-0"
              />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const vendorColour = (v) => {
  const k = String(v || "").toLowerCase();
  return k === "polar" ? T.accentAlt : k === "oura" ? T.textSecondary : k === "logged" ? T.good : T.textSecondary;
};

function Sessions({ ctx }) {
  const list = recentSessions(ctx);
  return (
    <Card title="Recent sessions" className="lg:col-span-2">
      {list.length === 0 ? (
        <p style={{ color: T.textMuted }} className="text-xs">
          No recorded sessions.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: T.textMuted }} className="text-[10px] uppercase tracking-wide text-left">
                <th className="font-normal pb-1">Date</th>
                <th className="font-normal pb-1">Sport</th>
                <th className="font-normal pb-1">mm:ss</th>
                <th className="font-normal pb-1">km</th>
                <th className="font-normal pb-1">HR avg / max</th>
                <th className="font-normal pb-1">Source</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: FONT_MONO, color: T.textPrimary }}>
              {list.map((s, i) => (
                <tr key={i} style={{ borderColor: T.border }} className="border-t">
                  <td className="py-1 pr-3">{s.day.slice(5)}</td>
                  <td className="py-1 pr-3" style={{ fontFamily: "inherit" }}>{s.sport}</td>
                  <td className="py-1 pr-3">{s.duration}</td>
                  <td className="py-1 pr-3">{s.km}</td>
                  <td className="py-1 pr-3">{s.hr}</td>
                  <td className="py-1" style={{ color: vendorColour(s.vendor) }}>{s.vendor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const STATUS_COLOUR = { normal: () => T.textSecondary, better: () => T.good, worse: () => T.warn };
const SPARK_W = 240;
const SPARK_H = 36;

/** "4.10." style, matching the other day labels in this tab. */
const shortDay = (key) => {
  const [, mo, d] = key.split("-").map(Number);
  return `${d}.${mo}.`;
};

/** Runs of consecutive non-null nights as SVG path strings; a null night breaks the line. */
function linePaths(points) {
  const paths = [];
  let cur = [];
  points.forEach((p) => {
    if (p == null) {
      if (cur.length) paths.push(cur);
      cur = [];
    } else cur.push(p);
  });
  if (cur.length) paths.push(cur);
  return paths.map((run) => run.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" "));
}

function Spark({ row }) {
  const { nights, baseline, outside } = row;
  const vals = nights.filter((n) => n.value != null).map((n) => n.value);
  let lo = Math.min(...vals, baseline ? baseline.lo : Infinity);
  let hi = Math.max(...vals, baseline ? baseline.hi : -Infinity);
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const x = (i) => (i / (nights.length - 1)) * SPARK_W;
  const y = (v) => SPARK_H - ((v - lo) / (hi - lo)) * SPARK_H;
  const pts = nights.map((n, i) => (n.value == null ? null : [x(i), y(n.value)]));
  const split = nights.length - WEEK_NIGHTS;
  // The older line runs one night into the last week so the two meet.
  const older = linePaths(pts.map((p, i) => (i <= split ? p : null)));
  const recent = linePaths(pts.map((p, i) => (i >= split ? p : null)));
  const dots = outside.map((o) => ({ ...o, i: nights.findIndex((n) => n.day === o.day) }));
  const status = row.week ? row.week.status : null;
  const aria = `${row.label}, last 30 nights${
    baseline ? `, 7-night average ${row.week ? row.week.status : "not available"} against your normal range` : ", building baseline"
  }`;
  return (
    <svg
      role="img"
      aria-label={aria}
      data-status={status || "none"}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: SPARK_H, overflow: "visible" }}
    >
      {baseline && (
        <>
          <rect x="0" y={y(baseline.hi)} width={SPARK_W} height={Math.max(0, y(baseline.lo) - y(baseline.hi))} fill={T.textMuted} fillOpacity="0.18" />
          <line x1="0" x2={SPARK_W} y1={y(baseline.mean)} y2={y(baseline.mean)} stroke={T.textMuted} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </>
      )}
      {older.map((d, i) => (
        <path key={"o" + i} d={d} fill="none" stroke={T.textMuted} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {recent.map((d, i) => (
        <path key={"r" + i} d={d} fill="none" stroke={T.textPrimary} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
      {/* Zero-length round-capped lines stay circular however the box is stretched. */}
      {dots.map((o) => (
        <line
          key={o.day}
          data-dot={o.better ? "better" : "worse"}
          x1={x(o.i)}
          x2={x(o.i)}
          y1={y(o.value)}
          y2={y(o.value)}
          stroke={o.better ? T.good : T.warn}
          strokeWidth="6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function Bars({ ctx }) {
  const data = recoveryBaseline(ctx.recovery);
  const last = data ? data.rows[data.rows.length - 1] : null;
  const named = data && /^Below normal/.test(data.verdict);
  return (
    <Card title="Recovery vs baseline">
      {!data ? (
        <p style={{ color: T.textMuted }} className="text-xs">
          No wearable data.
        </p>
      ) : (
        <>
          <p style={{ color: named ? T.warn : T.textSecondary }} className="text-xs mb-2">
            {data.verdict}
          </p>
          <div className="space-y-2.5">
            {data.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2" data-metric={r.id}>
                <span style={{ color: T.textSecondary }} className="text-[11px] w-16 shrink-0">
                  {r.label}
                </span>
                <span className="flex-1 min-w-0">
                  <Spark row={r} />
                </span>
                <span className="w-32 shrink-0 text-right leading-tight">
                  <span style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="block text-[12px]">
                    {r.latest == null ? "—" : fmtBaselineValue(r.id, r.latest) + (r.unit ? " " + r.unit : "")}
                  </span>
                  {r.baseline ? (
                    <>
                      {r.week ? (
                        <>
                          <span style={{ color: STATUS_COLOUR[r.week.status]() }} className="block text-[10px]">
                            {WEEK_NIGHTS}-night {fmtBaselineDelta(r.id, r.week.delta)} vs normal
                          </span>
                          <span className="block text-[10px]">
                            {r.week.status !== "normal" && <span style={{ color: STATUS_COLOUR[r.week.status]() }}>{r.week.status} · </span>}
                            <span style={{ color: T.textMuted }}>
                              normal {fmtBaselineValue(r.id, r.baseline.lo)}–{fmtBaselineValue(r.id, r.baseline.hi)}
                            </span>
                          </span>
                        </>
                      ) : (
                        <span style={{ color: T.textMuted }} className="block text-[10px]">
                          No readings in {WEEK_NIGHTS} nights · normal {fmtBaselineValue(r.id, r.baseline.lo)}–{fmtBaselineValue(r.id, r.baseline.hi)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: T.textMuted }} className="block text-[10px]">
                      Building baseline ({r.n}/{BASELINE_MIN})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1" aria-hidden="true">
            <span className="w-16 shrink-0" />
            <span style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="flex-1 flex justify-between text-[10px]">
              <span>{shortDay(last.nights[0].day)}</span>
              <span>{shortDay(last.nights[last.nights.length - 1].day)}</span>
            </span>
            <span className="w-32 shrink-0" />
          </div>
        </>
      )}
    </Card>
  );
}

export function Overview({ ctx }) {
  const catalogue = metricCatalogue(ctx);
  const [stored, setStored] = useState(() => readKpis(ctx.personId));
  const ids = resolveKpiIds(stored, catalogue);
  const change = useCallback(
    (n, id) => {
      const next = ids.slice();
      next[n] = id;
      setStored(next);
      writeKpis(ctx.personId, next);
    },
    [ids, ctx.personId]
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((n) => (
          <MetricBox key={n} n={n} personId={ctx.personId} ids={ids} catalogue={catalogue} ctx={ctx} onChange={change} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <WeekGrid ctx={ctx} />
        <Attention ctx={ctx} />
        <Sessions ctx={ctx} />
        <Bars ctx={ctx} />
      </div>
    </div>
  );
}
