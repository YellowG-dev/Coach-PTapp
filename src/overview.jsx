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

function MetricBox({ n, personId, ids, catalogue, ctx, onChange }) {
  const id = ids[n];
  const metric = computeMetric(id, ctx);
  const item = catalogue.flatMap((g) => g.items).find((i) => i.id === id);
  const colour = !metric || metric.value == null ? T.textMuted : metric.tone === "good" ? T.good : metric.tone === "warn" ? T.warn : T.textPrimary;
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
      <p style={{ fontFamily: FONT_MONO, color: colour }} className="text-3xl font-semibold leading-none mt-3">
        {metric && metric.value != null ? metric.value : "—"}
      </p>
      <p style={{ color: T.textMuted }} className="text-[11px] mt-2">
        {metric ? metric.note : "Unknown metric"}
      </p>
    </div>
  );
}

function WeekGrid({ ctx }) {
  const week = weekPlan(ctx);
  return (
    <Card title="This week · planned vs done" className="lg:col-span-2">
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d) => (
          <div
            key={d.key}
            data-day={d.key}
            style={{ borderColor: d.isToday ? T.accent : T.border, borderWidth: d.isToday ? 2 : 1 }}
            className="rounded-lg border px-1.5 py-2 min-w-0 min-h-[96px]"
          >
            <p style={{ color: d.isToday ? T.accent : T.textSecondary }} className="text-[10px] uppercase tracking-wide">
              {d.name} {d.dayOfMonth}
            </p>
            {d.skip && (
              <p style={{ color: T.accentAlt }} className="text-[11px] mt-1">
                Skip
              </p>
            )}
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
          </div>
        ))}
      </div>
    </Card>
  );
}

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
            <li key={i.id} style={{ color: T.textSecondary, borderColor: T.accent }} className="text-xs border-l-2 pl-2">
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

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
                  <td className="py-1" style={{ color: T.textMuted }}>{s.vendor}</td>
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
