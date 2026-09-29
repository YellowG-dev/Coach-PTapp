import React, { useState, useCallback, useMemo, useEffect } from "react";
import { insertProgramVersion } from "./core/data.js";
import { preflight } from "./core/publish.js";
import {
  startDraft, setBlockField, setExerciseField, listEditable,
  catalogue, takenExerciseIds, addExistingExercise, addNewExercise, removeExercise, moveExercise,
  addBlock, retireBlock, restoreBlock, setBlockCardio, setHrZones, standardHrZones, setCardioTypes, slugify,
  setScheduleCell, moveScheduleCell, setDayNote, copyWeek, weekFor, setOptionLabel, diffDefinitions, DOW_ORDER, DOW_NAMES,
  saveDraft, loadDraft, clearDraft, draftStatus,
} from "./core/editor.js";
import { slotMetaFor } from "./core/program-schema.js";
import { collectLoggedIds } from "./core/validate-program.js";
import { CheckResult } from "./check-result.jsx";
import { THEME as T, FONT_DISPLAY, FONT_MONO } from "./config.jsx";

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1); // same default as the Publisher
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};

const EX_TEXT = [
  ["name", "Name"], ["presc", "Prescription"], ["detail", "Detail"], ["pattern", "Pattern"],
  ["video", "Video"], ["altName", "Alt name"], ["altVideo", "Alt video"], ["unit", "Unit"],
];
const EX_NUM = [["sets", "Sets"], ["pctMin", "% min"], ["pctMax", "% max"]];

function Field({ label, value, onChange, disabled, mono, narrow, full, invalid }) {
  // Local buffer: a required field may be empty for a moment while retyping,
  // which the edit model (correctly) refuses. The draft keeps its last valid
  // value; the parent blocks Check until the field is filled in again.
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setText(value); }
  return (
    <label className={"block " + (narrow ? "w-20" : full ? "w-full" : "flex-1 min-w-[8rem]")}>
      <span style={{ color: T.textMuted }} className="text-[10px] block mb-0.5">{label}</span>
      <input
        type="text"
        value={text}
        disabled={disabled}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
        style={{ fontFamily: mono ? FONT_MONO : undefined, color: T.textPrimary, background: T.bg, borderColor: invalid ? T.warn : T.border }}
        className="w-full text-xs px-2 py-1 rounded-md border focus:outline-none focus-visible:ring-2"
      />
    </label>
  );
}

const BTN = "text-[11px] font-semibold px-2 py-1 rounded-md border focus:outline-none focus-visible:ring-2";

function Btn({ children, onClick, disabled, warn, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ borderColor: warn ? T.warn : T.border, color: disabled ? T.textMuted : warn ? T.warn : T.textSecondary }}
      className={BTN}
    >
      {children}
    </button>
  );
}

function Select({ label, value, onChange, options, disabled, narrow }) {
  return (
    <label className={"block " + (narrow ? "w-28" : "flex-1 min-w-[8rem]")}>
      <span style={{ color: T.textMuted }} className="text-[10px] block mb-0.5">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ color: T.textPrimary, background: T.bg, borderColor: T.border }}
        className="w-full text-xs px-2 py-1 rounded-md border focus:outline-none focus-visible:ring-2"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** One-line inline confirmation; nothing is removed until Confirm. */
function Confirm({ text, onYes, onNo }) {
  return (
    <p style={{ color: T.warn }} className="text-[11px] mt-1 flex flex-wrap items-center gap-2">
      <span>{text}</span>
      <Btn warn onClick={onYes}>Confirm</Btn>
      <Btn onClick={onNo}>Cancel</Btn>
    </p>
  );
}

/** Add existing (searchable picker over the client's catalogue) and Add new (name + type). */
function AddExercise({ cat, inBlock, onExisting, onNew }) {
  const [mode, setMode] = useState(null); // null | "existing" | "new"
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("exercise");
  const [unit, setUnit] = useState("");
  const matches = mode === "existing"
    ? cat.filter((e) => !inBlock.has(e.id) && (e.name || "").toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  const canAdd = name.trim() && slugify(name) && (type !== "number" || unit.trim());
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <Btn onClick={() => setMode(mode === "existing" ? null : "existing")}>Add existing</Btn>
        <Btn onClick={() => setMode(mode === "new" ? null : "new")}>Add new</Btn>
      </div>
      {mode === "existing" && (
        <div className="mt-1">
          <Field label="Search exercises this client has had" value={q} onChange={setQ} />
          {matches.length === 0 && <p style={{ color: T.textMuted }} className="text-[11px] mt-1">No matching exercise.</p>}
          {matches.map((e) => (
            <button
              type="button"
              key={e.id}
              onClick={() => { onExisting(e); setMode(null); setQ(""); }}
              style={{ color: T.textPrimary, borderColor: T.border }}
              className="block w-full text-left text-[11px] px-2 py-1 mt-1 rounded-md border focus:outline-none focus-visible:ring-2"
            >
              {e.name} <span style={{ color: T.textMuted, fontFamily: FONT_MONO }}>· {e.id}{e.type ? " · " + e.type : ""}</span>
            </button>
          ))}
        </div>
      )}
      {mode === "new" && (
        <div className="flex flex-wrap items-end gap-2 mt-1">
          <Field label="Name" value={name} onChange={setName} />
          <Select label="Type" narrow value={type} onChange={setType} options={[["exercise", "Exercise"], ["number", "Number"]]} />
          {type === "number" && <Field label="Unit" narrow value={unit} onChange={setUnit} />}
          <Btn
            disabled={!canAdd}
            onClick={() => { onNew({ name, type, unit }); setMode(null); setName(""); setUnit(""); setType("exercise"); }}
          >
            Add
          </Btn>
        </div>
      )}
    </div>
  );
}

function AddLabelled({ button, fieldLabel, shortLabel, onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [short, setShort] = useState("");
  if (!open) return <div className="mt-2"><Btn onClick={() => setOpen(true)}>{button}</Btn></div>;
  const close = () => { setOpen(false); setLabel(""); setShort(""); };
  return (
    <div className="flex flex-wrap items-end gap-2 mt-2">
      <Field label={fieldLabel} value={label} onChange={setLabel} />
      {shortLabel && <Field label={shortLabel} value={short} onChange={setShort} />}
      <Btn disabled={!label.trim() || !slugify(label)} onClick={() => { onAdd(label, short); close(); }}>Add</Btn>
      <Btn onClick={close}>Cancel</Btn>
    </div>
  );
}

const getStorage = () => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch (e) { return null; } };

/** Weekly schedule: Week A / Week B tabs and a Monday-first grid, one dropdown per slot per day. */
function ScheduleEditor({ draft, when, apply }) {
  const [week, setWeek] = useState("A");
  const slots = draft.slots || [];
  let auto = null;
  try { auto = weekFor(when); } catch (e) { /* date field is mid-edit */ }
  const other = week === "A" ? "B" : "A";
  const cellOptions = (slot, current) => {
    const opts = (draft.slotOptions && draft.slotOptions[slot]) || [];
    const live = opts.filter((o) => typeof o.value === "string").map((o) => [o.value, o.label]);
    const list = [["", "—"], ...live];
    if (current && !live.some(([k]) => k === current)) {
      const blk = draft.blocks && draft.blocks[slot] && draft.blocks[slot][current];
      list.push([current, `${(blk && blk.label) || current} (retired)`]);
    }
    return list;
  };
  return (
    <div style={{ borderColor: T.border }} className="rounded-lg border px-3 py-2 mt-4">
      <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">Weekly schedule</p>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {["A", "B"].map((w) => (
          <button
            type="button"
            key={w}
            onClick={() => setWeek(w)}
            style={{ borderColor: week === w ? T.textSecondary : T.border, color: week === w ? T.textPrimary : T.textMuted }}
            className={BTN}
          >
            Week {w}
          </button>
        ))}
        <Btn onClick={() => apply((d) => copyWeek(d, "A", "B"))}>Copy A → B</Btn>
        <Btn onClick={() => apply((d) => copyWeek(d, "B", "A"))}>Copy B → A</Btn>
      </div>
      <p style={{ color: T.textMuted }} className="text-[11px] mt-1">
        {auto ? `Week of ${when} is Week ${auto}.` : "Pick a valid effective date to see which week it falls in."} The client's own
        moved or cleared sessions still apply on top of this default week.
      </p>
      <div className="overflow-x-auto mt-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(7.5rem, 1fr))", minWidth: "54rem" }}>
          {DOW_ORDER.map((dow) => {
            const day = (draft.schedule && draft.schedule[week] && draft.schedule[week][dow]) || {};
            return (
              <div key={dow} data-dow={dow}>
                <p style={{ color: T.textPrimary }} className="text-[11px] font-semibold">{DOW_NAMES[dow]}</p>
                {slots.map((slot) => {
                  const cur = day[slot] || "";
                  const retired = cur && !((draft.slotOptions && draft.slotOptions[slot]) || []).some((o) => o.value === cur);
                  return (
                    <label key={slot} className="block mt-1" style={{ opacity: retired ? 0.5 : 1 }}>
                      <span style={{ color: T.textMuted }} className="text-[10px] block">{slot}</span>
                      <select
                        value={cur}
                        onChange={(e) => apply((d) => setScheduleCell(d, week, dow, slot, e.target.value || null))}
                        style={{ color: T.textPrimary, background: T.bg, borderColor: T.border }}
                        className="w-full text-xs px-1 py-1 rounded-md border focus:outline-none focus-visible:ring-2"
                      >
                        {cellOptions(slot, cur).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  );
                })}
                <div className="mt-1">
                  <Field label="Note" full value={day.note || ""} onChange={(v) => apply((d) => setDayNote(d, week, dow, v))} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p style={{ color: T.textMuted }} className="text-[10px] mt-1">Editing Week {week}; the other week is Week {other}.</p>
    </div>
  );
}

/* ------------------------------ R2: layout parts ---------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function mondayOf(d) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

const cardStyle = (color, selected) => ({
  background: T.card,
  borderColor: selected ? T.accent : T.border,
  borderLeft: `3px solid ${color}`,
});

/** One meta line for a library card. */
function blockMeta(slot, b) {
  if (slot === "strength") return `${b.exercises.length} exercise${b.exercises.length === 1 ? "" : "s"}`;
  const c = b.cardio || {};
  const parts = [];
  if (c.durationMin !== undefined && c.durationMin !== "") parts.push(`${c.durationMin} min`);
  if (c.zoneAvg) parts.push(c.zoneAvg);
  return parts.length ? parts.join(" · ") : "no target";
}

function Library({ ed, sel, onSelect, onDragStart, onDragEnd }) {
  const { draft, tree, apply } = ed;
  return (
    <div data-part="library" className="min-w-0">
      <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">Session library</p>
      {tree.map(({ slot, blocks }) => {
        const meta = slotMetaFor(draft, slot);
        const live = blocks.filter((b) => !b.retired);
        const retired = blocks.filter((b) => b.retired);
        return (
          <div key={slot} className="mt-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" style={{ background: meta.color }} className="inline-block w-1 h-4 rounded-sm" />
              <p style={{ color: T.textPrimary }} className="text-xs font-semibold">{meta.label}</p>
            </div>
            {live.map((b) => {
              const selected = sel && sel.slot === slot && sel.key === b.key;
              return (
                <div
                  key={b.key}
                  data-card="library"
                  draggable
                  onDragStart={(e) => onDragStart(e, { kind: "lib", slot, key: b.key })}
                  onDragEnd={onDragEnd}
                  onClick={() => onSelect({ slot, key: b.key })}
                  style={cardStyle(meta.color, selected)}
                  className="rounded-lg border px-2.5 py-1.5 mt-1.5 cursor-grab"
                >
                  <p style={{ color: T.textPrimary }} className="text-xs font-semibold truncate">{b.optionLabel || b.key}</p>
                  <p style={{ color: T.textSecondary }} className="text-[11px] truncate">{b.label}</p>
                  <p style={{ color: T.textMuted, fontFamily: FONT_MONO }} className="text-[10px]">{blockMeta(slot, b)}</p>
                </div>
              );
            })}
            {retired.length > 0 && (
              <details className="mt-1.5">
                <summary style={{ color: T.textMuted }} className="text-[11px] cursor-pointer">Retired ({retired.length})</summary>
                {retired.map((b) => (
                  <div
                    key={b.key}
                    style={{ ...cardStyle(meta.color, false), opacity: 0.6 }}
                    className="rounded-lg border px-2.5 py-1.5 mt-1.5"
                  >
                    <p style={{ color: T.textPrimary }} className="text-xs">{b.key} · retired</p>
                    <p style={{ color: T.textMuted }} className="text-[11px]">
                      {b.label} · {b.exercises.length} exercise{b.exercises.length === 1 ? "" : "s"}. Kept so history resolves.
                    </p>
                    <p className="mt-1"><Btn onClick={() => apply((d) => restoreBlock(d, slot, b.key))}>Restore</Btn></p>
                  </div>
                ))}
              </details>
            )}
            <AddLabelled
              button="+ Add block"
              fieldLabel="New block label"
              shortLabel="Short picker label (optional)"
              onAdd={(label, short) => apply((d) => addBlock(d, slot, label, short))}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The day note: italic text, click to edit. */
function NoteCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        defaultValue={value}
        aria-label="Day note"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
        style={{ color: T.textPrimary, background: T.bg, borderColor: T.border }}
        className="w-full text-[11px] px-1.5 py-1 rounded-md border focus:outline-none focus-visible:ring-2"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{ color: value ? T.textSecondary : T.textMuted }}
      className="w-full text-left text-[11px] italic leading-snug focus:outline-none focus-visible:underline"
    >
      {value || "Add note"}
    </button>
  );
}

function WeekBoard({ ed, week, sel, onSelect, drag, onDragStart, onDragEnd }) {
  const { draft, apply, when } = ed;
  const slots = draft.slots || [];
  const [over, setOver] = useState(null);
  let auto = null;
  try { auto = weekFor(when); } catch (e) { /* mid-edit */ }
  const eff = parseDay(when);
  const monday = eff ? mondayOf(eff) : null;
  // The tab of the effective date's week shows that week's dates; the other
  // tab shows the following week's.
  const dateOf = (dow) => {
    if (!monday) return null;
    const d = new Date(monday);
    d.setDate(d.getDate() + DOW_ORDER.indexOf(dow) + (auto && auto !== week ? 7 : 0));
    return d;
  };
  const drop = (e, dow) => {
    e.preventDefault();
    setOver(null);
    let p = drag;
    if (!p) { try { p = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (err) { p = null; } }
    onDragEnd();
    if (!p) return;
    if (p.kind === "lib") apply((d) => setScheduleCell(d, week, dow, p.slot, p.key));
    else if (p.kind === "day") apply((d) => moveScheduleCell(d, week, p.from, dow, p.slot));
  };
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(6.5rem, 1fr))", minWidth: "46rem" }}>
        {DOW_ORDER.map((dow) => {
          const day = (draft.schedule && draft.schedule[week] && draft.schedule[week][dow]) || {};
          const date = dateOf(dow);
          const hot = over === dow && drag;
          return (
            <div
              key={dow}
              data-dow={dow}
              data-part="day"
              onDragOver={(e) => { e.preventDefault(); if (over !== dow) setOver(dow); }}
              onDragLeave={() => setOver((o) => (o === dow ? null : o))}
              onDrop={(e) => drop(e, dow)}
              style={{ borderColor: hot ? T.accent : T.border, background: hot ? T.bg : "transparent", borderStyle: drag ? "dashed" : "solid" }}
              className="rounded-lg border px-1.5 py-2 min-h-[9rem] flex flex-col min-w-0"
            >
              <p style={{ color: T.textPrimary }} className="text-[11px] font-semibold">
                {DOW_NAMES[dow]}
                {date && <span style={{ color: T.textMuted }} className="font-normal"> · {dayLabel(date)}</span>}
              </p>
              <div className="flex-1">
                {slots.map((slot) => {
                  const key = day[slot];
                  if (!key) return null;
                  const meta = slotMetaFor(draft, slot);
                  const opt = ((draft.slotOptions && draft.slotOptions[slot]) || []).find((o) => o && o.value === key);
                  const blk = draft.blocks && draft.blocks[slot] && draft.blocks[slot][key];
                  const selected = sel && sel.slot === slot && sel.key === key;
                  return (
                    <div
                      key={slot}
                      data-card="day"
                      draggable
                      onDragStart={(e) => onDragStart(e, { kind: "day", week, from: dow, slot, key })}
                      onDragEnd={onDragEnd}
                      onClick={() => onSelect({ slot, key })}
                      style={{ ...cardStyle(meta.color, selected), opacity: opt ? 1 : 0.6 }}
                      className="rounded-md border px-2 py-1 mt-1.5 cursor-grab"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p style={{ color: T.textPrimary }} className="text-[11px] font-semibold leading-tight break-words">
                          {opt ? opt.label : `${(blk && blk.label) || key} (retired)`}
                        </p>
                        <button
                          type="button"
                          aria-label={`Remove ${slot} from ${DOW_NAMES[dow]}`}
                          onClick={(e) => { e.stopPropagation(); apply((d) => setScheduleCell(d, week, dow, slot, null)); }}
                          style={{ color: T.textMuted }}
                          className="text-xs leading-none px-0.5 focus:outline-none focus-visible:ring-2"
                        >
                          ×
                        </button>
                      </div>
                      <p style={{ color: T.textMuted }} className="text-[10px]">{meta.label}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2">
                <NoteCell key={week + dow} value={day.note || ""} onChange={(v) => apply((d) => setDayNote(d, week, dow, v))} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The existing block editor, for the one selected block. */
function BlockEditor({ ed, slot, b, blocks }) {
  const { draft, apply, applyRequired, blanks, setBlanks, pending, setPending, cat, takenIds } = ed;
  const bk = slot + "/" + b.key;
  const liveCount = blocks.filter((x) => !x.retired).length;
  const zones = (draft.hrZones || []).map((z) => [z.id, z.label || z.id]);
  const numberTasks = b.exercises.filter((e) => e.type === "number").map((e) => [e.id, e.name || e.id]);
  const cardioSel = (f) => {
    const cur = b.cardio[f] || "";
    const opts = [["", "—"], ...zones];
    if (cur && !zones.some(([id]) => id === cur)) opts.push([cur, cur + " (not in zones)"]);
    return opts;
  };
  const setCardio = (patch) => apply((d) => setBlockCardio(d, slot, b.key, patch));
  return (
    <div data-part="block" style={{ borderColor: T.border }} className="rounded-lg border px-3 py-2 mt-4">
      <div className="flex items-center justify-between gap-2">
        <p style={{ color: T.textPrimary }} className="text-xs font-semibold">
          {slot} · {b.key}{b.retired ? " · retired (read-only)" : ""}
        </p>
        {b.retired ? (
          <Btn onClick={() => apply((d) => restoreBlock(d, slot, b.key))}>Restore</Btn>
        ) : (
          <Btn
            disabled={liveCount < 2}
            title={liveCount < 2 ? "The last block in a slot cannot be retired" : undefined}
            onClick={() => setPending("retire:" + bk)}
          >
            Retire
          </Btn>
        )}
      </div>
      {pending === "retire:" + bk && (
        <Confirm
          text={`Retire ${b.key}? It leaves the picker but stays in the programme; history is kept.`}
          onYes={() => apply((d) => retireBlock(d, slot, b.key))}
          onNo={() => setPending(null)}
        />
      )}
      {b.retired ? (
        <p style={{ color: T.textMuted }} className="text-[11px] mt-1">
          {b.label} · {b.exercises.length} exercise{b.exercises.length === 1 ? "" : "s"}. Kept so history resolves.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-1">
            <Field label="Label" value={b.label} invalid={Boolean(blanks[bk])} onChange={(v) => applyRequired(bk, v, (d) => setBlockField(d, slot, b.key, "label", v))} />
            <Field label="Subtitle" value={b.subtitle} onChange={(v) => apply((d) => setBlockField(d, slot, b.key, "subtitle", v))} />
            <Field label="Gentler note" value={b.gentlerNote} onChange={(v) => apply((d) => setBlockField(d, slot, b.key, "gentlerNote", v))} />
          </div>
          <div className="mt-1">
            <Field
              label="Short label in the client's picker"
              value={b.optionLabel}
              invalid={Boolean(blanks["opt:" + bk])}
              onChange={(v) => applyRequired("opt:" + bk, v, (d) => setOptionLabel(d, slot, b.key, v))}
            />
          </div>
          <label style={{ color: T.textSecondary }} className="text-[11px] flex items-center gap-1.5 mt-1">
            <input
              type="checkbox"
              checked={b.noGym}
              onChange={(e) => apply((d) => setBlockField(d, slot, b.key, "noGym", e.target.checked))}
            />
            No-gym block
          </label>
          {b.exercises.map((e, i) => (
            <div key={e.id} style={{ borderColor: T.border }} className="border-t mt-2 pt-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p style={{ color: T.textMuted, fontFamily: FONT_MONO }} className="text-[10px]">
                  {e.id}{e.type ? " · " + e.type : ""}
                </p>
                <div className="flex gap-1">
                  <Btn disabled={i === 0} title="Move up" onClick={() => apply((d) => moveExercise(d, slot, b.key, e.id, -1))}>↑</Btn>
                  <Btn disabled={i === b.exercises.length - 1} title="Move down" onClick={() => apply((d) => moveExercise(d, slot, b.key, e.id, 1))}>↓</Btn>
                  <Btn onClick={() => setPending("rm:" + bk + "/" + e.id)}>Remove</Btn>
                </div>
              </div>
              {pending === "rm:" + bk + "/" + e.id && (
                <Confirm
                  text={`Remove ${e.name || e.id} from ${b.key}? Logged history for ${e.id} is kept.`}
                  onYes={() => {
                    setBlanks((bl) => { const n = { ...bl }; delete n[e.id]; return n; });
                    apply((d) => removeExercise(d, slot, b.key, e.id));
                  }}
                  onNo={() => setPending(null)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {EX_TEXT.map(([f, l]) => (
                  <Field
                    key={f}
                    label={l}
                    value={e[f]}
                    invalid={f === "name" && Boolean(blanks[e.id])}
                    onChange={(v) =>
                      f === "name"
                        ? applyRequired(e.id, v, (d) => setExerciseField(d, slot, b.key, e.id, f, v))
                        : apply((d) => setExerciseField(d, slot, b.key, e.id, f, v))
                    }
                  />
                ))}
                {EX_NUM.map(([f, l]) => (
                  <Field
                    key={f}
                    label={l}
                    narrow
                    mono
                    value={e[f]}
                    onChange={(v) => apply((d) => setExerciseField(d, slot, b.key, e.id, f, v))}
                  />
                ))}
              </div>
            </div>
          ))}
          <AddExercise
            cat={cat}
            inBlock={new Set(b.exercises.map((e) => e.id))}
            onExisting={(entry) => apply((d) => addExistingExercise(d, slot, b.key, entry))}
            onNew={(f) => apply((d) => addNewExercise(d, slot, b.key, f, takenIds()))}
          />
          {slot !== "strength" && (
            <div style={{ borderColor: T.border }} className="border-t mt-3 pt-2">
              <p style={{ color: T.textSecondary }} className="text-[11px] font-bold">Cardio target</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Field label="Duration (min)" narrow mono value={b.cardio.durationMin === undefined ? "" : b.cardio.durationMin} onChange={(v) => setCardio({ durationMin: v })} />
                <Field label="Distance (km)" narrow mono value={b.cardio.distanceKm === undefined ? "" : b.cardio.distanceKm} onChange={(v) => setCardio({ distanceKm: v })} />
                <Select label="Avg zone" narrow disabled={!zones.length} value={b.cardio.zoneAvg || ""} onChange={(v) => setCardio({ zoneAvg: v })} options={cardioSel("zoneAvg")} />
                <Select label="Max zone" narrow disabled={!zones.length} value={b.cardio.zoneMax || ""} onChange={(v) => setCardio({ zoneMax: v })} options={cardioSel("zoneMax")} />
                <Field label="Pace (m:ss)" narrow mono value={b.cardio.pace || ""} onChange={(v) => setCardio({ pace: v })} />
                <Field label="Note" value={b.cardio.note || ""} onChange={(v) => setCardio({ note: v })} />
                <Select
                  label="Duration field"
                  value={b.cardio.durationTaskId || ""}
                  onChange={(v) => setCardio({ durationTaskId: v })}
                  options={[["", "—"], ...numberTasks, ...(b.cardio.durationTaskId && !numberTasks.some(([id]) => id === b.cardio.durationTaskId) ? [[b.cardio.durationTaskId, b.cardio.durationTaskId + " (not a number task)"]] : [])]}
                />
              </div>
              {!zones.length && (
                <p style={{ color: T.textMuted }} className="text-[11px] mt-1">
                  Zones need a heart-rate zone table — add one under Heart-rate zones on the right.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <details style={{ borderColor: T.border }} className="border-t mt-3 pt-2">
      <summary style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide cursor-pointer">{title}</summary>
      {children}
    </details>
  );
}

function PublishPanel({ ed, week }) {
  const { draft, apply, when, setWhen, changes, hasBlank, runCheck, result, busy, doPublish, published, notice } = ed;
  let auto = null;
  try { auto = weekFor(when); } catch (e) { /* mid-edit */ }
  return (
    <div data-part="publish" className="min-w-0">
      <label style={{ color: T.textSecondary }} className="text-[11px] block mb-1">Effective from</label>
      <input
        type="date"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        style={{ fontFamily: FONT_MONO, color: T.textPrimary, background: T.bg, borderColor: T.border }}
        className="text-xs px-2 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
      />
      <p style={{ color: T.textMuted }} className="text-[11px] mt-1">
        {auto ? `Falls in Week ${auto}.` : "Pick a valid effective date to see which week it falls in."}
      </p>

      <div style={{ borderColor: T.border }} className="rounded-lg border px-3 py-2 mt-3">
        <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">
          Changes{changes.length ? ` · ${changes.length}` : ""}
        </p>
        {changes.length === 0 ? (
          <p style={{ color: T.textMuted }} className="text-[11px] mt-1">No changes</p>
        ) : (
          <ul style={{ color: T.textPrimary }} className="text-[11px] mt-1 leading-relaxed list-disc pl-4">
            {changes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={runCheck}
          disabled={hasBlank || changes.length === 0}
          style={{ borderColor: T.border, color: hasBlank || changes.length === 0 ? T.textMuted : T.textPrimary }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
        >
          Check
        </button>
        {result && result.ok && (
          <button
            onClick={doPublish}
            disabled={busy}
            style={{ background: T.good, color: T.onAccent }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus-visible:ring-2"
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>

      {hasBlank && (
        <p style={{ color: T.warn }} className="text-[11px] mt-2">
          ✕ A block label or exercise name is empty. Fill it in to check.
        </p>
      )}

      {notice && <p style={{ color: T.warn }} className="text-[11px] mt-2">✕ {notice}</p>}

      <CheckResult result={result} when={when} />

      {published && (
        <p style={{ color: published.ok ? T.good : T.warn }} className="text-[11px] mt-3 leading-relaxed">
          {published.ok
            ? `Published ${published.row.id}, effective ${published.row.effective_from}. The days above have been re-scored.`
            : "✕ " + published.error}
        </p>
      )}

      <Section title="Heart-rate zones">
        <p style={{ color: T.textMuted }} className="text-[11px] mt-0.5">% of max HR; one table per client. Zone ids are permanent once used.</p>
        {(draft.hrZones || []).map((z, i) => {
          const upd = (patch) => apply((d) => setHrZones(d, d.hrZones.map((x, j) => (j === i ? { ...x, ...patch } : x))));
          return (
            <div key={i} className="flex flex-wrap items-end gap-2 mt-1">
              <Field label="Id" narrow mono value={z.id} onChange={(v) => upd({ id: v })} />
              <Field label="Label" value={z.label} onChange={(v) => upd({ label: v })} />
              <Field label="% min" narrow mono value={String(z.pctMin)} onChange={(v) => upd({ pctMin: v })} />
              <Field label="% max" narrow mono value={String(z.pctMax)} onChange={(v) => upd({ pctMax: v })} />
              <Btn onClick={() => apply((d) => setHrZones(d, d.hrZones.filter((_, j) => j !== i)))}>Remove</Btn>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2 mt-2">
          <Btn onClick={() => apply((d) => setHrZones(d, [...(d.hrZones || []), { id: "Z" + ((d.hrZones || []).length + 1), label: "New zone", pctMin: 50, pctMax: 60 }]))}>Add zone</Btn>
          <Btn onClick={() => apply((d) => setHrZones(d, standardHrZones()))}>Use standard PK1/PK2/VK</Btn>
        </div>
      </Section>

      <Section title="Cardio types">
        <p style={{ color: T.textMuted }} className="text-[11px] mt-0.5">
          The list for extra cardio. Sports are comma-separated; a slot means a workout of that sport satisfies the planned slot.
        </p>
        {(draft.cardioTypes || []).map((t, i) => {
          const upd = (patch) => apply((d) => setCardioTypes(d, d.cardioTypes.map((x, j) => (j === i ? { ...x, ...patch } : x))));
          return (
            <div key={t.id + i} className="flex flex-wrap items-end gap-2 mt-1">
              <p style={{ color: T.textMuted, fontFamily: FONT_MONO }} className="text-[10px] w-16 pb-1.5">{t.id}</p>
              <Field label="Label" value={t.label || ""} onChange={(v) => upd({ label: v })} />
              <Field label="Sports" value={(t.sports || []).join(", ")} onChange={(v) => upd({ sports: v.split(",") })} />
              <Select label="Slot" narrow value={t.slot || ""} onChange={(v) => upd({ slot: v })} options={[["", "— extras only"], ...(draft.slots || []).map((sl) => [sl, sl])]} />
              <Btn onClick={() => apply((d) => setCardioTypes(d, d.cardioTypes.filter((_, j) => j !== i)))}>Remove</Btn>
            </div>
          );
        })}
        <AddLabelled
          button="Add cardio type"
          fieldLabel="New type label"
          onAdd={(label) =>
            apply((d) => {
              const ids = new Set((d.cardioTypes || []).map((t) => t.id));
              ids.add("other"); // reserved
              const base = slugify(label);
              let id = base, n = 1;
              while (ids.has(id)) id = base + "-" + ++n;
              return setCardioTypes(d, [...(d.cardioTypes || []), { id, label, sports: [] }]);
            })
          }
        />
      </Section>

      <Section title="Day notes">
        <p style={{ color: T.textMuted }} className="text-[11px] mt-0.5">Shown on the client's day. Editing Week {week}.</p>
        {DOW_ORDER.map((dow) => {
          const day = (draft.schedule && draft.schedule[week] && draft.schedule[week][dow]) || {};
          return (
            <div key={dow} className="mt-1">
              <Field label={DOW_NAMES[dow]} full value={day.note || ""} onChange={(v) => apply((d) => setDayNote(d, week, dow, v))} />
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function Workspace({ ed }) {
  const { draft, tree, when, apply, current, changes, savedAt, defaultView, defaultSelected } = ed;
  let auto = null;
  try { auto = weekFor(when); } catch (e) { /* mid-edit */ }
  const [week, setWeek] = useState(auto || "A");
  const [view, setView] = useState(defaultView === "table" ? "table" : "board");
  const [selRaw, setSel] = useState(() => {
    const [slot, key] = String(defaultSelected || "").split("/");
    return slot && key ? { slot, key } : null;
  });
  const [drag, setDrag] = useState(null);

  // Nothing (valid) selected → the first block of the first slot.
  const find = (s) => {
    const g = s && tree.find((t) => t.slot === s.slot);
    return g && g.blocks.find((b) => b.key === s.key) ? s : null;
  };
  const first = tree.length && tree[0].blocks.length
    ? { slot: tree[0].slot, key: (tree[0].blocks.find((b) => !b.retired) || tree[0].blocks[0]).key }
    : null;
  const sel = find(selRaw) || first;
  const selGroup = sel && tree.find((t) => t.slot === sel.slot);
  const selBlock = selGroup && selGroup.blocks.find((b) => b.key === sel.key);

  const onDragStart = (e, payload) => {
    setDrag(payload);
    try { e.dataTransfer.setData("text/plain", JSON.stringify(payload)); e.dataTransfer.effectAllowed = "copyMove"; } catch (err) { /* not a real drag */ }
  };
  const onDragEnd = () => setDrag(null);

  const effWeekLabel = (w) => {
    const eff = parseDay(when);
    if (!eff || auto !== w) return `Week ${w}`;
    return `Week ${w} · ${dayLabel(mondayOf(eff))}`;
  };
  const hh = (n) => String(n).padStart(2, "0");

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p style={{ color: T.textPrimary }} className="text-xs font-semibold">
          {current.baseName}
          <span style={{ color: T.textMuted, fontFamily: FONT_MONO }} className="font-normal ml-2">
            {changes.length === 0 ? "no changes" : `draft · saved ${savedAt ? hh(savedAt.getHours()) + ":" + hh(savedAt.getMinutes()) : "—"}`}
          </span>
        </p>
        <span className="flex-1" />
        {["A", "B"].map((w) => (
          <button
            type="button"
            key={w}
            onClick={() => setWeek(w)}
            style={{ borderColor: week === w ? T.textSecondary : T.border, color: week === w ? T.textPrimary : T.textMuted }}
            className={BTN}
          >
            {effWeekLabel(w)}
          </button>
        ))}
        <Btn onClick={() => apply((d) => copyWeek(d, "A", "B"))}>Copy A → B</Btn>
        <Btn onClick={() => apply((d) => copyWeek(d, "B", "A"))}>Copy B → A</Btn>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Library ed={ed} sel={sel} onSelect={setSel} onDragStart={onDragStart} onDragEnd={onDragEnd} />

        <div className="min-w-0">
          <div style={{ borderColor: T.border }} className="rounded-lg border px-3 py-2">
            <div className="flex items-center gap-2 mb-2">
              <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">Week board</p>
              <span className="flex-1" />
              <Btn onClick={() => setView(view === "board" ? "table" : "board")}>{view === "board" ? "Table" : "Board"}</Btn>
            </div>
            {view === "board" ? (
              <>
                <WeekBoard ed={ed} week={week} sel={sel} onSelect={setSel} drag={drag} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                <p style={{ color: T.textMuted }} className="text-[10px] mt-2">
                  Drag a library card onto a day to place it, or a day card to another day to move it (a full slot swaps). × removes.
                  Use Table for keyboard editing. The client's own moved or cleared sessions still apply on top of this default week.
                </p>
              </>
            ) : (
              <ScheduleEditor draft={draft} when={when} apply={apply} />
            )}
          </div>
          {selBlock && <BlockEditor key={sel.slot + "/" + sel.key} ed={ed} slot={sel.slot} b={selBlock} blocks={selGroup.blocks} />}
        </div>

        <PublishPanel ed={ed} week={week} />
      </div>
    </div>
  );
}

/**
 * Edit fields of the existing blocks and exercises of the version in force,
 * then hand the result to the same preflight() → insertProgramVersion() path
 * as the paste Publisher. Two-step by construction, as there: Publish does not
 * exist until a check has passed, and any edit discards the check.
 *
 * Retired blocks are shown greyed and read-only; history still resolves
 * against them.
 */
export function ProgrammeEditor({ person, programs, logRows, ownerId, onPublished, defaultOpen, defaultView, defaultSelected }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [session, setSession] = useState(null); // { draft, baseId, baseName, baseFrom } | { draft:null, reason }
  const [when, setWhen] = useState(tomorrow);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(null);
  const [notice, setNotice] = useState(null); // an edit the model refused
  const [pending, setPending] = useState(null); // inline confirmation awaiting an answer
  const [savedAt, setSavedAt] = useState(null); // when the working draft was last written to storage

  // Derived on open so a collapsed panel costs nothing, and so the render
  // harness (defaultOpen) sees the same content a click would produce.
  const current = open ? session || startDraft(programs, person.id, tomorrow()) : null;
  const draft = current && current.draft;
  const tree = useMemo(() => (draft ? listEditable(draft) : []), [draft]);
  const cat = useMemo(() => (open ? catalogue(programs, person.id) : []), [open, programs, person.id]);
  const takenIds = () => takenExerciseIds(programs, person.id, collectLoggedIds((logRows || []).map((r) => r && r.payload)));

  // A draft saved by an earlier visit (localStorage; Coach has its own origin).
  const [storageTick, setStorageTick] = useState(0);
  const [promptDone, setPromptDone] = useState(false);
  const savedNow = useMemo(() => (open ? loadDraft(getStorage(), person.id) : null), [open, person.id, storageTick]);
  const baseDef = current && draft ? ((programs || []).find((r) => r.id === current.baseId) || {}).definition : null;
  const changes = useMemo(() => (draft && baseDef ? diffDefinitions(baseDef, draft) : []), [draft, baseDef]);
  const promptSaved = open && !session && savedNow && current && draft && !promptDone;

  useEffect(() => {
    if (!session || !session.draft) return;
    const base = ((programs || []).find((r) => r.id === session.baseId) || {}).definition;
    if (!base) return;
    if (diffDefinitions(base, session.draft).length) {
      saveDraft(getStorage(), person.id, session.baseId, session.draft);
      setSavedAt(new Date());
    } else {
      clearDraft(getStorage(), person.id);
      setSavedAt(null);
    }
  }, [session]);

  const begin = () => {
    setSession(null);
    setPromptDone(false);
    setWhen(tomorrow());
    setResult(null);
    setPublished(null);
    setBlanks({});
    setNotice(null);
    setPending(null);
    setOpen(true);
  };

  const [blanks, setBlanks] = useState({}); // required fields currently empty

  const apply = (fn) => {
    setResult(null);
    setPublished(null);
    setPending(null);
    try {
      setSession({ ...current, draft: fn(current.draft) });
      setNotice(null);
    } catch (e) {
      setNotice(e.message);
    }
  };
  // Required fields (block label, exercise name) go through here.
  const applyRequired = (key, v, fn) => {
    const empty = !v.trim();
    setResult(null);
    setPublished(null);
    setBlanks((b) => { const n = { ...b }; if (empty) n[key] = true; else delete n[key]; return n; });
    if (!empty) setSession({ ...current, draft: fn(current.draft) });
  };
  const hasBlank = Object.keys(blanks).length > 0;

  const runCheck = useCallback(() => {
    setResult(
      preflight({ person, text: JSON.stringify(draft), effectiveFrom: when, existingRows: programs, logRows, ownerId })
    );
  }, [person, draft, when, programs, logRows, ownerId]);

  const doPublish = useCallback(async () => {
    if (!result || !result.ok || !result.row) return;
    setBusy(true);
    const r = await insertProgramVersion(result.row);
    setBusy(false);
    setPublished(r);
    if (r.ok) {
      clearDraft(getStorage(), person.id);
      setStorageTick((n) => n + 1);
      setResult(null);
      setSession(null);
      if (onPublished) onPublished();
    }
  }, [result, onPublished]);

  if (!open) {
    return (
      <button
        onClick={begin}
        style={{ borderColor: T.border, color: T.textSecondary }}
        className="w-full mt-4 text-xs font-semibold py-2 rounded-lg border focus:outline-none focus-visible:ring-2"
      >
        Edit programme for {person.name}
      </button>
    );
  }

  const ed = {
    draft, tree, cat, when, apply, applyRequired, blanks, setBlanks, pending, setPending, notice, changes, hasBlank,
    runCheck, result, busy, doPublish, published, takenIds, current, savedAt, person, defaultView, defaultSelected,
    setWhen: (v) => { setResult(null); setPublished(null); setWhen(v); },
  };

  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border px-4 py-3 mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-sm font-bold">
          Edit programme · {person.name}
        </p>
        <button
          onClick={() => { setOpen(false); setSession(null); setResult(null); setBlanks({}); setNotice(null); setPending(null); }}
          style={{ color: T.textSecondary }}
          className="text-xs font-semibold focus:outline-none focus-visible:underline"
        >
          Close
        </button>
      </div>

      {!draft ? (
        <p style={{ color: T.warn }} className="text-[11px] mt-2">{current.reason}</p>
      ) : (
        <>
          <p style={{ color: T.textMuted }} className="text-[11px] mt-1 leading-relaxed">
            Based on: {current.baseName} (in force from {String(current.baseFrom)}). Edits the weekly schedule, blocks, exercises, cardio
            targets and heart-rate zones; testing and daily sections carry over unchanged. Exercise IDs
            cannot be changed, and history is kept when an exercise is removed or a block retired.{" "}
            <strong style={{ color: T.textSecondary }}>Publishing changes {person.name}'s app.</strong>
          </p>

          {promptSaved ? (
            <div style={{ borderColor: T.warn }} className="rounded-lg border px-3 py-2 mt-3">
              {draftStatus(savedNow, current.baseId) === "resume" ? (
                <>
                  <p style={{ color: T.textPrimary }} className="text-[11px]">
                    A saved draft from {String(savedNow.savedAt).slice(0, 16).replace("T", " ")} is available for this version.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Btn onClick={() => { setSession({ ...current, draft: savedNow.draft }); setPromptDone(true); }}>Resume draft</Btn>
                    <Btn warn onClick={() => { clearDraft(getStorage(), person.id); setStorageTick((n) => n + 1); setPromptDone(true); }}>Discard</Btn>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: T.warn }} className="text-[11px]">
                    A saved draft exists, but it was made on a version that is no longer in force (someone published
                    meanwhile), so it cannot be resumed.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Btn warn onClick={() => { clearDraft(getStorage(), person.id); setStorageTick((n) => n + 1); setPromptDone(true); }}>Discard</Btn>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Workspace ed={ed} />
            </>
          )}
        </>
      )}
    </div>
  );
}
