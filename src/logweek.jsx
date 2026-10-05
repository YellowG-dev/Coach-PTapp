// Training log tab — a week grid with the selected day's card beneath it.
// All numbers come from core/logweek.js; this file only lays them out.

import React, { useState, useMemo } from "react";
import { pctLabel } from "./core/adherence.js";
import { dateKey, getWeekMonday } from "./core/dates.js";
import { logWeek, dayDetail, defaultDay, weekTitle, LOG_RULES, setLabel, fmtNum, signed, shortDate } from "./core/logweek.js";
import { labelFor as labelOf } from "./core/shape.js";
import { THEME as T, FONT_DISPLAY, FONT_MONO } from "./config.jsx";

const TONE = {
  on: { bg: T.doneBg, fg: T.good },
  off: { bg: T.warnBg, fg: T.warn },
  neutral: { bg: T.panel, fg: T.textPrimary },
};
const toneStyle = (tone, hasValue) => (hasValue ? TONE[tone || "neutral"] : { bg: T.panel, fg: T.textSecondary });
const pct10 = Math.round(LOG_RULES.caloriesWithin * 100);

const dash = "—";

/* ---------------------------------- week ---------------------------------- */

function Tile({ label, value, sub, subColour }) {
  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-xl border px-4 py-3 min-w-0">
      <p style={{ color: T.textSecondary }} className="text-xs">
        {label}
      </p>
      <p style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-2xl font-semibold mt-1 leading-tight">
        {value}
      </p>
      <p style={{ color: subColour || T.textSecondary }} className="text-xs mt-0.5">
        {sub}
      </p>
    </div>
  );
}

function Tiles({ week }) {
  const t = week.totals;
  const dayCount = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const lowList = t.proteinLow.map((l) => `${fmtNum(l.value)} g on ${l.label}`).join(", ");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Tile
        label="Strength"
        value={t.sessions ? dayCount(t.sessions, "session", "sessions") : dash}
        sub={t.sets ? `${t.sets} sets · ${fmtNum(t.volumeKg)} kg` : "no sets logged"}
      />
      <Tile
        label="Cardio"
        value={t.cardioMin != null ? `${Math.round(t.cardioMin)} min` : dash}
        sub={t.cardioCleared.length ? `cardio cleared ${t.cardioCleared.join(" and ")}` : t.cardioMin != null ? "planned + confirmed extras" : "none declared this week"}
      />
      <Tile
        label="Calories / day"
        value={t.kcalAvg != null ? fmtNum(t.kcalAvg) : dash}
        sub={t.kcalJudged ? `${t.kcalOnTarget} of ${t.kcalJudged} days within ±${pct10}%` : t.kcalDays ? "no target to compare" : "no calories logged"}
      />
      <Tile
        label={t.proteinTarget != null ? `Protein ≥ ${fmtNum(t.proteinTarget)} g` : "Protein"}
        value={t.proteinJudged ? `${t.proteinOn} / ${t.proteinJudged} days` : dash}
        sub={t.proteinJudged ? (lowList ? `low: ${lowList}` : `none more than ${Math.round(LOG_RULES.proteinLowBy * 100)}% under`) : "no protein logged"}
      />
      <Tile
        label="Weigh-in"
        value={t.weighLast ? `${t.weighLast.value} kg` : dash}
        sub={
          t.weighChange != null
            ? `${signed(t.weighChange, 1)} kg since ${shortDate(t.weighFirst.day)} (${t.weighFirst.value})`
            : t.weighLast
            ? "one weigh-in this week"
            : "no weigh-in"
        }
      />
    </div>
  );
}

const ROW_H = "h-10";

function Cell({ tone, hasValue = true, children, title, mono = true }) {
  const c = toneStyle(tone, hasValue);
  return (
    <span
      title={title}
      style={{ background: c.bg, color: c.fg, fontFamily: mono ? FONT_MONO : undefined }}
      className={`${ROW_H} px-2.5 rounded-lg flex items-center text-[13px] whitespace-nowrap overflow-hidden`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function DayColumn({ d, selected, onSelect }) {
  const has = (v) => v != null;
  const sess = d.session;
  const sessionCell =
    sess.kind === "cleared" ? (
      <Cell tone="off" mono={false}>Cleared</Cell>
    ) : sess.kind === "session" ? (
      <Cell tone="neutral" mono={false} title={sess.full}>
        <span style={{ color: sess.color || T.accentAlt }}>●</span> {sess.text}
      </Cell>
    ) : (
      <Cell hasValue={false} mono={false}>{sess.text}</Cell>
    );
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${d.label}: ${sess.text}`}
      onClick={() => onSelect(d.day)}
      data-day={d.day}
      data-selected={selected ? "true" : "false"}
      style={selected ? { boxShadow: `inset 0 0 0 1px ${T.accent}` } : undefined}
      className="flex-1 min-w-[110px] flex flex-col gap-1.5 text-left rounded-lg focus:outline-none focus-visible:ring-2"
    >
      <span
        style={{ color: selected ? T.textPrimary : T.textSecondary, borderBottom: `2px solid ${selected ? T.accent : "transparent"}` }}
        className="h-9 px-2.5 flex items-center text-xs font-semibold"
      >
        {d.label}
        {d.isToday && <span style={{ color: T.accent }} className="ml-1.5 text-[10px] font-normal">today</span>}
      </span>
      {sessionCell}
      <Cell tone={d.tone.exercises} hasValue={has(d.exercisesLogged)}>
        {has(d.exercisesLogged) ? `${d.exercisesLogged} / ${d.exercisesPlanned}` : dash}
      </Cell>
      <Cell hasValue={has(d.sets)} tone="neutral">
        {has(d.sets) ? `${d.sets} · ${fmtNum(d.volumeKg)}` : dash}
      </Cell>
      <Cell tone={d.tone.mobility} hasValue={d.mobility != null}>
        {d.mobility ? d.mobility.done : dash}
      </Cell>
      <Cell tone={d.tone.kcal} hasValue={has(d.kcal)}>
        {has(d.kcal) ? (has(d.kcalDiff) ? `${fmtNum(d.kcal)} ${signed(d.kcalDiff)}` : fmtNum(d.kcal)) : dash}
      </Cell>
      <Cell tone={d.tone.protein} hasValue={has(d.protein)}>
        {has(d.protein) ? fmtNum(d.protein) : dash}
      </Cell>
      <Cell tone="neutral" hasValue={has(d.weigh)}>
        {has(d.weigh) ? d.weigh : dash}
      </Cell>
      <Cell tone={d.tone.alcohol} hasValue={has(d.knee) || has(d.alcohol)}>
        {has(d.knee) || has(d.alcohol) ? `${has(d.knee) ? d.knee : dash} · ${has(d.alcohol) ? d.alcohol : dash}` : dash}
      </Cell>
      {d.note ? (
        <span title={d.note} style={{ background: T.panel, color: T.accent }} className={`${ROW_H} px-2.5 rounded-lg flex items-center text-[13px]`}>
          ✎ note
        </span>
      ) : (
        <span className={ROW_H} />
      )}
    </button>
  );
}

function Legend() {
  const sw = (bg, bd) => <span style={{ background: bg, borderColor: bd }} className="inline-block w-3 h-3 rounded-[3px] border" aria-hidden="true" />;
  return (
    <div style={{ color: T.textSecondary }} className="flex items-center gap-4 text-xs flex-wrap" aria-label="Colour key">
      <span className="inline-flex items-center gap-1.5">{sw(T.doneBg, T.doneBorder)} on target</span>
      <span className="inline-flex items-center gap-1.5">{sw(T.warnBg, T.warn)} off target</span>
      <span className="inline-flex items-center gap-1.5">{sw(T.panel, T.border)} no target</span>
    </div>
  );
}

function Grid({ week, selected, onSelect }) {
  const mobTotals = [...new Set(week.days.filter((d) => d.mobility).map((d) => d.mobility.total))];
  const protTargets = [...new Set(week.days.map((d) => d.targets && d.targets.protein).filter((v) => v != null))];
  const labels = [
    "Session",
    "Exercises logged",
    "Sets · volume",
    mobTotals.length === 1 ? `Mobility (of ${mobTotals[0]})` : "Mobility",
    "Calories vs target",
    protTargets.length === 1 ? `Protein (${fmtNum(protTargets[0])} g)` : "Protein",
    "Weigh-in (kg)",
    "Knee · alcohol",
    "Note",
  ];
  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-xl border px-3 pt-2 pb-3 overflow-x-auto" data-part="week-grid">
      <div className="flex gap-1.5 min-w-[980px]">
        <div className="w-[150px] shrink-0 flex flex-col gap-1.5" aria-hidden="true">
          <span className="h-9" />
          {labels.map((l) => (
            <span key={l} style={{ color: T.textSecondary }} className={`${ROW_H} px-2 flex items-center text-[13px]`}>
              {l}
            </span>
          ))}
        </div>
        {week.days.map((d) => (
          <DayColumn key={d.day} d={d} selected={d.day === selected} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- day card -------------------------------- */

function Chip({ children, tone }) {
  return (
    <span style={{ color: tone === "accent" ? T.accent : T.textSecondary, borderColor: T.border }} className="text-[11px] px-2 py-0.5 rounded-full border">
      {children}
    </span>
  );
}

function ResultTile({ label, children, sub, subColour, last }) {
  return (
    <div style={{ borderColor: T.border }} className={"px-4 py-3 min-w-0 " + (last ? "" : "lg:border-r")}>
      <p style={{ color: T.textSecondary }} className="text-xs">
        {label}
      </p>
      <div style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-base mt-1">
        {children}
      </div>
      {sub != null && (
        <p style={{ color: subColour || T.textSecondary }} className="text-xs mt-0.5">
          {sub}
        </p>
      )}
    </div>
  );
}

function Results({ d }) {
  const mobPct = d.mobility ? Math.round((d.mobility.done / d.mobility.total) * 100) : 0;
  const mobColour = d.tone.mobility === "on" ? T.good : d.tone.mobility === "off" ? T.warn : T.textSecondary;
  const protColour = d.tone.protein === "on" ? T.good : d.tone.protein === "off" ? T.warn : T.textPrimary;
  const kneeText = d.knee != null ? `Knee ${d.knee}${d.kneeMax ? "/" + d.kneeMax : ""}` : null;
  const alcText = d.alcohol != null ? `Alcohol ${d.alcohol}` : null;
  return (
    <div
      data-part="results"
      style={{ borderColor: T.border, background: T.panel }}
      className="grid grid-cols-2 lg:grid-cols-6 border-t border-b"
    >
      <ResultTile label="Strength" sub={d.sets != null ? `${fmtNum(d.volumeKg)} kg volume` : "no sets logged"}>
        {d.sets != null ? `${d.sets} sets` : dash}
      </ResultTile>
      <ResultTile label="Mobility">
        {d.mobility ? `${d.mobility.done} / ${d.mobility.total}` : dash}
        {d.mobility && (
          <span style={{ background: T.border }} className="block h-1 rounded-sm mt-1.5 overflow-hidden" aria-hidden="true">
            <span style={{ background: mobColour, width: mobPct + "%" }} className="block h-full" />
          </span>
        )}
      </ResultTile>
      <ResultTile
        label="Calories"
        sub={d.targets && d.targets.cal != null ? `target ${fmtNum(d.targets.cal)}${d.kcalDiff != null ? " · " + signed(d.kcalDiff) : ""}` : d.kcal != null ? "no target" : null}
      >
        {d.kcal != null ? fmtNum(d.kcal) : dash}
      </ResultTile>
      <ResultTile label="Protein" sub={d.targets && d.targets.protein != null ? `target ${fmtNum(d.targets.protein)} g` : d.protein != null ? "no target" : null}>
        <span style={{ color: protColour }}>{d.protein != null ? `${fmtNum(d.protein)} g${d.tone.protein === "on" ? " ✓" : ""}` : dash}</span>
      </ResultTile>
      <ResultTile
        label="Weigh-in"
        sub={d.prevWeigh ? `${signed(d.prevWeigh.diff, 1)} vs ${d.prevWeigh.yesterday ? "yesterday" : shortDate(d.prevWeigh.day)}` : null}
      >
        {d.weigh != null ? `${d.weigh} kg` : dash}
      </ResultTile>
      <ResultTile label="Checks" last sub={d.checks.length ? d.checks.map((c) => c + " ✓").join(" · ") : null} subColour={T.good}>
        <span style={{ fontFamily: "inherit" }} className="text-[13px]">
          {kneeText || alcText ? [kneeText, alcText].filter(Boolean).join(" · ") : dash}
        </span>
      </ResultTile>
    </div>
  );
}

function ExerciseTable({ rows }) {
  const cols = { gridTemplateColumns: "2.2fr 3fr 1.2fr 1.6fr" };
  const vsColour = (v) => (v && v.dir === "up" ? T.good : v && v.dir === "down" ? T.warn : T.textSecondary);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]" role="table" aria-label="Exercises">
        <div role="row" style={{ ...cols, color: T.textSecondary, borderColor: T.border }} className="grid gap-3 py-2.5 text-xs border-b">
          <span role="columnheader">Exercise</span>
          <span role="columnheader">Sets (reps × kg)</span>
          <span role="columnheader">Top set</span>
          <span role="columnheader">vs last time</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} role="row" style={{ ...cols, borderColor: T.border }} className="grid gap-3 py-2.5 items-center border-b">
            <span role="cell" style={{ color: T.textPrimary }} className="text-sm min-w-0">
              {r.name}
              {r.forName && (
                <span style={{ color: T.accentAlt }} className="text-xs ml-1.5">
                  for {r.forName}
                </span>
              )}
              {r.note && (
                <span style={{ color: T.accent }} className="block text-xs">
                  {r.note}
                </span>
              )}
            </span>
            <span role="cell" style={{ fontFamily: FONT_MONO }} className="flex gap-1.5 flex-wrap text-xs">
              {r.sets.map((s, i) => (
                <span key={i} style={{ background: T.rowSelected, color: T.textPrimary }} className="px-2 py-0.5 rounded-md">
                  {setLabel(s)}
                </span>
              ))}
            </span>
            <span role="cell" style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-[13px]">
              {r.top ? (r.top.w != null && r.top.r != null ? `${r.top.r} × ${r.top.w}` : setLabel(r.top)) : dash}
            </span>
            <span role="cell" style={{ color: vsColour(r.vs) }} className="text-[13px]">
              {r.vs ? r.vs.text : dash}
              {r.vs && r.vs.ref && (r.vs.dir === "up" || r.vs.dir === "down" || r.vs.dir === "same") && (
                <span style={{ color: T.textMuted }} className="text-xs">
                  {" "}
                  ({r.vs.ref})
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The card for one day. `day` is { day, log, override }; `detail` is the
 * dayDetail() model. Without `detail` the card is built from `day` alone — no
 * plan, targets or history — so it renders anywhere it is dropped in.
 */
export function DayCardView({ day, scored, names, detail, selected }) {
  const d = useMemo(
    () =>
      detail ||
      dayDetail({
        day: day.day,
        logRows: day.log ? [{ day: day.day, payload: day.log }] : [],
        overrideRows: day.override ? [{ day: day.day, payload: day.override }] : [],
        programRows: [],
        names,
        pctByDay: scored ? { [day.day]: scored } : {},
        history: false,
      }),
    [detail, day, scored, names]
  );
  const shaped = d._shaped;
  const sc = scored || d.adherence;
  const barColour = sc && sc.pct != null ? (sc.pct >= 0.8 ? T.good : sc.pct >= 0.5 ? T.accent : T.warn) : T.accent;
  const colour = d.session.color || T.textMuted;
  const other = shaped
    ? [
        ...shaped.measurements.filter((m) => !/^nut-|^chk-weigh$|^chk-alc-units$/.test(m.id)).map((m) => `${labelOf(m.id, names)} ${m.value}`),
        ...shaped.ratings.filter((r) => r.id !== "chk-knee").map((r) => `${labelOf(r.id, names)} ${r.value}`),
      ]
    : [];
  return (
    <div
      data-part="day-card"
      data-day={d.day}
      style={{ background: T.card, borderColor: selected ? T.accent : T.border }}
      className="rounded-2xl border overflow-hidden max-w-[72rem]"
    >
      <div className="flex items-center gap-4 px-5 py-4 flex-wrap">
        <div className="w-[52px] text-center" aria-hidden="true">
          <div style={{ color: T.textSecondary }} className="text-xs font-semibold">
            {d.weekdayShort}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-[26px] font-semibold leading-tight">
            {d.dayNumber}
          </div>
          <div style={{ color: T.textSecondary }} className="text-xs">
            {d.monthShort}
          </div>
        </div>
        <div className="flex-1 basis-[360px] min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ background: colour }} className="w-2.5 h-2.5 rounded-[3px] shrink-0" aria-hidden="true" />
            <h3 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-lg font-semibold">
              <span className="sr-only">{d.weekdayName} {d.dayNumber} {d.monthShort}: </span>
              {d.title}
            </h3>
          </div>
          {d.subtitle && (
            <p style={{ color: T.textSecondary }} className="text-[13px] mt-1">
              {d.subtitle}
            </p>
          )}
          <div className="flex gap-1.5 flex-wrap mt-1.5 empty:hidden">
            {d.gentler && <Chip tone="accent">Gentler week</Chip>}
            {shaped && shaped.weekType && <Chip>Week {String(shaped.weekType).toUpperCase()}</Chip>}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {sc && sc.skip && <Chip>cleared</Chip>}
          {sc && !sc.skip && sc.pct != null && (
            <>
              <span style={{ background: T.border }} className="w-40 h-2 rounded overflow-hidden" aria-hidden="true">
                <span style={{ background: barColour, width: Math.round(sc.pct * 100) + "%" }} className="block h-full" />
              </span>
              <span style={{ fontFamily: FONT_MONO, color: barColour }} className="text-[13px]">
                {pctLabel(sc.pct)} · {sc.doneCount}/{sc.total}
              </span>
            </>
          )}
          {sc && !sc.skip && sc.pct == null && <Chip>nothing scheduled</Chip>}
        </div>
      </div>

      {d.hasContent ? <Results d={d} /> : null}

      <div className="px-5 pt-2 pb-4">
        {!d.hasLog && (
          <p style={{ color: T.textMuted }} className="text-xs py-2">
            Nothing was logged for this day.
          </p>
        )}
        {d.hasLog && !d.hasContent && (
          <p style={{ color: T.textMuted }} className="text-xs py-2">
            The day was opened but nothing was recorded.
          </p>
        )}
        {!d.skip && d.rows.length > 0 && <ExerciseTable rows={d.rows} />}

        {(d.ticked.length > 0 || d.notDone.length > 0 || d.clearedSlots.length > 0) && (
          <div className="flex gap-x-6 gap-y-1 flex-wrap pt-3 text-[13px]">
            {d.ticked.length > 0 && (
              <span style={{ color: T.textSecondary }}>
                Ticked, no sets: <span style={{ color: T.textPrimary }}>{d.ticked.join(", ")}</span>
              </span>
            )}
            {d.notDone.length > 0 && (
              <span style={{ color: T.textSecondary }}>
                Not done: <span style={{ color: T.warn }}>{d.notDone.join(", ")}</span>
              </span>
            )}
            {d.clearedSlots.length > 0 && <span style={{ color: T.textSecondary }}>{d.clearedSlots.join(" · ")}</span>}
          </div>
        )}

        {other.length > 0 && (
          <p style={{ color: T.textSecondary }} className="text-[13px] pt-3">
            Also recorded: <span style={{ color: T.textPrimary }}>{other.join(" · ")}</span>
          </p>
        )}

        {d.note && (
          <blockquote style={{ borderColor: T.accent, color: T.textPrimary }} className="border-l-2 pl-3 mt-3 text-sm">
            {d.note}
          </blockquote>
        )}

        {shaped && shaped.unknown && (
          <details className="mt-3">
            <summary style={{ color: T.textSecondary }} className="text-xs cursor-pointer">
              Other recorded fields
            </summary>
            <pre style={{ fontFamily: FONT_MONO, color: T.textSecondary, background: T.bg, borderColor: T.border }} className="text-[11px] p-2 mt-1 rounded-lg border overflow-x-auto">
              {JSON.stringify(shaped.unknown, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- the tab --------------------------------- */

/**
 * Week grid on top, the selected day's card below. Everything is derived from
 * the rows the panel already holds; nothing is estimated.
 */
export function LogWeek({ person, logRows, overrideRows, programRows, pctByDay, names, today, initialWeek }) {
  const now = useMemo(() => today || new Date(), [today]);
  const [weekStart, setWeekStart] = useState(() => getWeekMonday(initialWeek || now));
  const week = useMemo(
    () => logWeek({ weekStart, logRows, overrideRows, programRows, pctByDay, today: now }),
    [weekStart, logRows, overrideRows, programRows, pctByDay, now]
  );
  const [picked, setPicked] = useState(null);
  const inWeek = picked && week.days.some((d) => d.day === picked);
  const selected = inWeek ? picked : defaultDay(week, now);

  const thisMonday = dateKey(getWeekMonday(now));
  const earliest = useMemo(() => {
    const keys = [...(logRows || []), ...(overrideRows || [])].map((r) => r.day).sort();
    return keys.length ? keys[0] : null;
  }, [logRows, overrideRows]);
  const canPrev = earliest != null && earliest < week.start;
  const canNext = week.start < thisMonday;
  const go = (n) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7 * n);
    setWeekStart(d);
    setPicked(null);
  };

  const dayRow = (rows, key) => rows.find((r) => r.day === key);
  const detail = useMemo(
    () =>
      selected
        ? dayDetail({ day: selected, logRows, overrideRows, programRows, names, pctByDay, today: now })
        : null,
    [selected, logRows, overrideRows, programRows, names, pctByDay, now]
  );
  const navBtn = (label, glyph, onClick, disabled) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{ background: T.card, borderColor: T.border, color: disabled ? T.textMuted : T.textPrimary, opacity: disabled ? 0.5 : 1 }}
      className="w-11 h-11 rounded-lg border text-lg focus:outline-none focus-visible:ring-2"
    >
      {glyph}
    </button>
  );

  return (
    <div className="space-y-4" data-part="log-week">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {navBtn("Previous week", "‹", () => go(-1), !canPrev)}
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-[22px] font-semibold leading-tight" data-part="week-title">
              {weekTitle(week)}
            </p>
            <p style={{ color: T.textSecondary }} className="text-[13px]">
              {person.name} · Training log
            </p>
          </div>
          {navBtn("Next week", "›", () => go(1), !canNext)}
        </div>
        <Legend />
      </div>

      <Tiles week={week} />
      <Grid week={week} selected={selected} onSelect={setPicked} />

      <p style={{ color: T.textSecondary }} className="text-xs font-semibold uppercase tracking-wide">
        Selected day · click any column above to change it
      </p>
      {detail ? (
        <DayCardView
          key={detail.day}
          day={{ day: detail.day, log: (dayRow(logRows, detail.day) || {}).payload || null, override: (dayRow(overrideRows, detail.day) || {}).payload || null }}
          scored={pctByDay ? pctByDay[detail.day] : null}
          names={names}
          detail={detail}
          selected
        />
      ) : (
        <div style={{ background: T.card, borderColor: T.border, color: T.textMuted }} className="rounded-2xl border px-5 py-4 text-sm">
          Nothing was logged this week. Use ‹ to look at an earlier week.
        </div>
      )}
    </div>
  );
}

