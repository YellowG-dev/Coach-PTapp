// Progress tab (Coach redesign R3): what the client sees in their own app's
// Progress view, plus the wearable trends. Numbers come from core/progress.js
// and engine.js; this file only lays them out.

import React, { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { connectionLabel } from "./core/recovery.js";
import {
  recoveryTrends, trendRowsFor, trackedCards, exercisesWithHistory, loadSeriesFor, consistencySeries, sessionsBySport,
} from "./core/progress.js";
import { THEME as T, FONT_DISPLAY, FONT_MONO } from "./config.jsx";

const tooltipStyle = { background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: FONT_MONO, fontSize: 11 };
const tick = { fill: T.textMuted, fontSize: 10 };
// Axis labels: at most one decimal, and whole numbers only unless the metric needs decimals.
const fmtTick = (v) => +Number(v).toFixed(1);
const GRID = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]";
const GRID_SMALL = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]";

function Card({ title, right, children, attrs }) {
  return (
    <section
      {...attrs}
      style={{ background: T.card, borderColor: T.border }}
      className="rounded-xl border px-4 py-3 min-w-0"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-sm font-bold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Heading({ children }) {
  return (
    <h2 style={{ fontFamily: FONT_DISPLAY, color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide mt-5 mb-2">
      {children}
    </h2>
  );
}

const fmt = (v, digits) => (v == null ? "—" : digits ? v.toFixed(digits) : Math.round(v).toLocaleString("en-GB"));

function RecoveryCard({ c }) {
  const good = c.vs30 == null ? null : c.vs30;
  const arrow = good == null || Math.abs(good) < (c.digits ? 0.05 : 0.5) ? "=" : good > 0 ? "▲" : "▼";
  const diff = good == null ? "" : fmt(Math.abs(good), c.digits);
  return (
    <Card
      title={c.title}
      attrs={{ "data-chart": "recovery", "data-chart-id": c.id }}
      right={
        <span style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-sm font-semibold">
          {fmt(c.latest, c.digits)}{c.latest == null ? "" : c.unit}
        </span>
      }
    >
      <p style={{ color: T.textMuted }} className="text-[11px] -mt-1 mb-1">
        {c.latest == null ? "No readings in 30 days" : arrow === "=" ? "= 30-day avg" : `${arrow} ${diff} vs 30-day avg`}
        {c.latestDay ? ` · ${c.latestDay.slice(5)}` : ""}
      </p>
      <div style={{ width: "100%", height: 110 }}>
        <ResponsiveContainer>
          {c.kind === "bar" ? (
            <BarChart data={c.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmtTick} allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: T.textSecondary }} formatter={(v, n) => [v == null ? "—" : Number(v).toLocaleString("en-GB"), n]} />
              <Bar dataKey="value" name="Steps" fill={T.accentAlt} radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={c.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmtTick} allowDecimals={c.digits > 0} domain={["dataMin - 1", "dataMax + 1"]} tick={tick} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: T.textSecondary }} formatter={(v, n) => [v == null ? "—" : `${Math.round(v * 10) / 10}${c.unit}`, n]} />
              <Line type="monotone" dataKey="value" name={c.title} stroke={T.textMuted} strokeWidth={1.5} dot={{ r: 1.5, fill: T.textMuted }} connectNulls={false} />
              <Line type="monotone" dataKey="avg7" name="7-day avg" stroke={T.accentAlt} strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TrackedCard({ c }) {
  const latest = c.data[c.data.length - 1];
  const isTotal = c.kind === "total";
  const lineKey = isTotal ? "total" : "avg";
  return (
    <Card
      title={c.title}
      attrs={{ "data-card": "tracked", "data-track-id": c.id }}
      right={
        latest && (
          <span style={{ fontFamily: FONT_MONO, color: T.textSecondary }} className="text-xs shrink-0">
            {isTotal ? `${latest.total}${c.unit} · last ${c.totalWindow} days` : c.hideValue ? `${latest.avg}${c.unit}` : `${latest.value}${c.unit} · ${latest.avg} avg`}
          </span>
        )
      }
    >
      <div style={{ width: "100%", height: 150 }}>
        <ResponsiveContainer>
          <LineChart data={c.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtTick} allowDecimals={false} domain={isTotal ? [0, "dataMax + 2"] : c.domain} tick={tick} axisLine={false} tickLine={false} width={34} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: T.textSecondary }} />
            {c.reference != null && <ReferenceLine y={c.reference} stroke={T.textMuted} strokeDasharray="4 3" strokeWidth={1} />}
            {!c.hideValue && <Line type="monotone" dataKey="value" stroke={T.textMuted} strokeWidth={1.5} dot={{ r: 2, fill: T.textMuted }} />}
            <Line type="monotone" dataKey={lineKey} stroke={c.color} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ color: T.textMuted }} className="text-[11px] mt-2">{c.note}</p>
      {c.referenceLabel && <p style={{ color: T.textMuted }} className="text-[11px] mt-1">Dashed line: {c.referenceLabel}</p>}
    </Card>
  );
}

function Stronger({ ctx }) {
  const list = useMemo(() => exercisesWithHistory(ctx), [ctx]);
  const [picked, setPicked] = useState(null);
  const id = picked && list.some((e) => e.id === picked) ? picked : list[0] && list[0].id;
  const series = useMemo(() => loadSeriesFor(ctx, id), [ctx, id]);
  return (
    <Card
      title="Getting stronger"
      attrs={{ "data-card": "stronger" }}
      right={
        list.length > 0 && (
          <select
            aria-label="Exercise"
            value={id || ""}
            onChange={(e) => setPicked(e.target.value)}
            style={{ background: T.bg, borderColor: T.border, color: T.textPrimary }}
            className="text-[11px] px-2 py-1 rounded-lg border max-w-[11rem] focus:outline-none focus-visible:ring-2"
          >
            {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )
      }
    >
      {series.length > 1 ? (
        <div style={{ width: "100%", height: 150 }}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmtTick} allowDecimals={false} domain={["dataMin - 2", "dataMax + 2"]} tick={tick} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: T.textSecondary }} formatter={(v) => [`${v} kg`, "Heaviest set"]} />
              <Line type="monotone" dataKey="maxWeight" stroke={T.accent} strokeWidth={2.5} dot={{ r: 2, fill: T.accent }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: T.textMuted }} className="text-xs">
          {list.length === 0 ? "No weights logged yet." : "This exercise needs two logged sessions before a trend appears."}
        </p>
      )}
    </Card>
  );
}

function Consistency({ ctx }) {
  const data = useMemo(() => consistencySeries(ctx), [ctx]);
  return (
    <Card title="Consistency" attrs={{ "data-card": "consistency" }}>
      {data.length ? (
        <>
          <div style={{ width: "100%", height: 150 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={fmtTick} allowDecimals={false} domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: T.textSecondary }} formatter={(v, n) => [`${v}%`, n]} />
                <Line type="monotone" dataKey="pct" name="Complete" stroke={T.textMuted} strokeWidth={1.5} dot={{ r: 2, fill: T.textMuted }} />
                <Line type="monotone" dataKey="avg7" name="7-day avg" stroke={T.accentAlt} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ color: T.textMuted }} className="text-[11px] mt-2">
            Share of the day's planned items completed, last 60 days. Skip days are left out, not counted as zero.
          </p>
        </>
      ) : (
        <p style={{ color: T.textMuted }} className="text-xs">No scored days in the last 60 days.</p>
      )}
    </Card>
  );
}

function Sports({ ctx }) {
  const rows = useMemo(() => sessionsBySport(ctx), [ctx]);
  const max = rows.length ? Math.max(...rows.map((r) => r.minutes), 1) : 1;
  return (
    <Card title="Sessions by sport · 30 days" attrs={{ "data-card": "sports" }}>
      {rows.length === 0 ? (
        <p style={{ color: T.textMuted }} className="text-xs">No recorded sessions in 30 days.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.sport} className="flex items-center gap-2">
              <span style={{ color: T.textSecondary }} className="text-[11px] w-28 shrink-0 truncate" title={r.label}>{r.label}</span>
              <span style={{ background: T.border }} className="flex-1 h-2 rounded-full overflow-hidden" aria-hidden="true">
                <span style={{ background: r.color, width: Math.max(4, Math.round((r.minutes / max) * 100)) + "%" }} className="block h-full" />
              </span>
              <span style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-[11px] w-24 text-right shrink-0">
                {r.n}× · {r.minutes} min
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const TONE = { good: T.good, warn: T.warn };

export function Progress({ ctx, recovery, connections, names }) {
  const conns = connections || [];
  const trends = useMemo(
    () => recoveryTrends(recovery, ctx.days, ctx.personId),
    [recovery, ctx.days, ctx.personId]
  );
  const rows = useMemo(() => trendRowsFor(ctx), [ctx]);
  const tracked = useMemo(() => trackedCards(ctx, rows), [ctx, rows]);
  const c = { ...ctx, names: names || ctx.names };

  return (
    <div data-part="progress">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-base font-bold">Progress</h2>
        {conns.map((k) => {
          const l = connectionLabel(k);
          return (
            <span
              key={k.vendor}
              style={{ color: TONE[l.tone] || T.textSecondary, borderColor: T.border, fontFamily: FONT_MONO }}
              className="text-[11px] px-2 py-0.5 rounded-full border"
            >
              {k.vendor} · {l.text}
            </span>
          );
        })}
      </div>

      <Heading>Recovery trends · 30 days</Heading>
      {trends ? (
        <>
          <div className={GRID_SMALL}>
            {trends.map((t) => <RecoveryCard key={t.id} c={t} />)}
          </div>
          <p style={{ color: T.textMuted }} className="text-[10px] mt-2">
            Grey is each night, blue the 7-day average. Nights the device did not record are gaps, never zeroes.
          </p>
        </>
      ) : (
        <p style={{ color: T.textMuted }} className="text-xs">
          {conns.length ? "Connected, but no readings have arrived yet." : "No wearable connected, so there is no sleep, readiness or heart data."}
        </p>
      )}

      <Heading>Tracked items</Heading>
      {tracked.length ? (
        <div className={GRID}>
          {tracked.map((t) => <TrackedCard key={t.id} c={t} />)}
        </div>
      ) : (
        <p style={{ color: T.textMuted }} className="text-xs">Nothing tracked in the programme in force has data yet.</p>
      )}

      <Heading>Strength, consistency and sessions</Heading>
      <div className={GRID}>
        <Stronger ctx={c} />
        <Consistency ctx={c} />
        <Sports ctx={c} />
      </div>
    </div>
  );
}
