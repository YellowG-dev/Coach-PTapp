import React, { useState, useCallback, useMemo } from "react";
import { insertProgramVersion } from "./core/data.js";
import { preflight } from "./core/publish.js";
import {
  startDraft, setBlockField, setExerciseField, listEditable,
  catalogue, takenExerciseIds, addExistingExercise, addNewExercise, removeExercise, moveExercise,
  addBlock, retireBlock, restoreBlock, setBlockCardio, setHrZones, standardHrZones, setCardioTypes, slugify,
} from "./core/editor.js";
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

function Field({ label, value, onChange, disabled, mono, narrow, invalid }) {
  // Local buffer: a required field may be empty for a moment while retyping,
  // which the edit model (correctly) refuses. The draft keeps its last valid
  // value; the parent blocks Check until the field is filled in again.
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setText(value); }
  return (
    <label className={"block " + (narrow ? "w-20" : "flex-1 min-w-[8rem]")}>
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

function AddLabelled({ button, fieldLabel, onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  if (!open) return <div className="mt-2"><Btn onClick={() => setOpen(true)}>{button}</Btn></div>;
  return (
    <div className="flex flex-wrap items-end gap-2 mt-2">
      <Field label={fieldLabel} value={label} onChange={setLabel} />
      <Btn disabled={!label.trim() || !slugify(label)} onClick={() => { onAdd(label); setOpen(false); setLabel(""); }}>Add</Btn>
      <Btn onClick={() => { setOpen(false); setLabel(""); }}>Cancel</Btn>
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
export function ProgrammeEditor({ person, programs, logRows, ownerId, onPublished, defaultOpen }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [session, setSession] = useState(null); // { draft, baseId, baseName, baseFrom } | { draft:null, reason }
  const [when, setWhen] = useState(tomorrow);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(null);
  const [notice, setNotice] = useState(null); // an edit the model refused
  const [pending, setPending] = useState(null); // inline confirmation awaiting an answer

  // Derived on open so a collapsed panel costs nothing, and so the render
  // harness (defaultOpen) sees the same content a click would produce.
  const current = open ? session || startDraft(programs, person.id, tomorrow()) : null;
  const draft = current && current.draft;
  const tree = useMemo(() => (draft ? listEditable(draft) : []), [draft]);
  const cat = useMemo(() => (open ? catalogue(programs, person.id) : []), [open, programs, person.id]);
  const takenIds = () => takenExerciseIds(programs, person.id, collectLoggedIds((logRows || []).map((r) => r && r.payload)));

  const begin = () => {
    setSession(startDraft(programs, person.id, tomorrow()));
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
            Based on: {current.baseName} (in force from {String(current.baseFrom)}). Edits blocks, exercises, cardio
            targets and heart-rate zones; schedule, testing and daily sections carry over unchanged. Exercise IDs
            cannot be changed, and history is kept when an exercise is removed or a block retired.{" "}
            <strong style={{ color: T.textSecondary }}>Publishing changes {person.name}'s app.</strong>
          </p>

          {tree.map(({ slot, blocks }) => (
            <div key={slot} className="mt-4">
              <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">{slot}</p>
              {blocks.map((b) => {
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
                <div
                  key={b.key}
                  style={{ borderColor: T.border, opacity: b.retired ? 0.5 : 1 }}
                  className="rounded-lg border px-3 py-2 mt-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ color: T.textPrimary }} className="text-xs font-semibold">
                      {b.key}{b.retired ? " · retired (read-only)" : ""}
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
                      {b.label} · {b.exercises.length} exercise{b.exercises.length === 1 ? "" : "s"}. Kept so history
                      resolves.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Field label="Label" value={b.label} invalid={Boolean(blanks[slot + "/" + b.key])} onChange={(v) => applyRequired(slot + "/" + b.key, v, (d) => setBlockField(d, slot, b.key, "label", v))} />
                        <Field label="Subtitle" value={b.subtitle} onChange={(v) => apply((d) => setBlockField(d, slot, b.key, "subtitle", v))} />
                        <Field label="Gentler note" value={b.gentlerNote} onChange={(v) => apply((d) => setBlockField(d, slot, b.key, "gentlerNote", v))} />
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
                              Zones need a heart-rate zone table — add one under Heart-rate zones below.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                );
              })}
              <AddLabelled button="Add block" fieldLabel="New block label" onAdd={(label) => apply((d) => addBlock(d, slot, label))} />
            </div>
          ))}

          <div style={{ borderColor: T.border }} className="border-t mt-4 pt-3">
            <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">Heart-rate zones</p>
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
            <div className="flex gap-2 mt-2">
              <Btn onClick={() => apply((d) => setHrZones(d, [...(d.hrZones || []), { id: "Z" + ((d.hrZones || []).length + 1), label: "New zone", pctMin: 50, pctMax: 60 }]))}>Add zone</Btn>
              <Btn onClick={() => apply((d) => setHrZones(d, standardHrZones()))}>Use standard PK1/PK2/VK</Btn>
            </div>
          </div>

          <div style={{ borderColor: T.border }} className="border-t mt-4 pt-3">
            <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">Cardio types</p>
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
          </div>

          <label style={{ color: T.textSecondary }} className="text-[11px] block mt-4 mb-1">
            Effective from
          </label>
          <input
            type="date"
            value={when}
            onChange={(e) => { setResult(null); setPublished(null); setWhen(e.target.value); }}
            style={{ fontFamily: FONT_MONO, color: T.textPrimary, background: T.bg, borderColor: T.border }}
            className="text-xs px-2 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
          />

          <div className="flex gap-2 mt-2">
            <button
              onClick={runCheck}
              disabled={hasBlank}
              style={{ borderColor: T.border, color: hasBlank ? T.textMuted : T.textPrimary }}
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
        </>
      )}
    </div>
  );
}
