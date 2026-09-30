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
  recoveryBars,
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

function Bars({ ctx }) {
  const rows = recoveryBars(ctx.recovery);
  return (
    <Card title="Recovery · 7 nights">
      {!rows ? (
        <p style={{ color: T.textMuted }} className="text-xs">
          No wearable data.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span style={{ color: T.textSecondary }} className="text-[11px] w-20 shrink-0">
                {r.label}
              </span>
              <span className="flex-1 flex items-end gap-1 h-6" aria-hidden="true">
                {r.values.map((v, i) => (
                  <span
                    key={i}
                    style={{
                      background: v == null ? "transparent" : T.accentAlt,
                      borderColor: T.border,
                      height: v == null ? "100%" : Math.max(8, Math.round((v / r.max) * 100)) + "%",
                    }}
                    className={"flex-1 rounded-sm " + (v == null ? "border border-dashed" : "")}
                  />
                ))}
              </span>
              <span style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-[11px] w-12 text-right shrink-0">
                {r.latest == null ? "—" : r.latest + (r.unit || "")}
              </span>
            </div>
          ))}
        </div>
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
