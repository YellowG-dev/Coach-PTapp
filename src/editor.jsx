import React, { useState, useCallback, useMemo } from "react";
import { insertProgramVersion } from "./core/data.js";
import { preflight } from "./core/publish.js";
import { startDraft, setBlockField, setExerciseField, listEditable } from "./core/editor.js";
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

  // Derived on open so a collapsed panel costs nothing, and so the render
  // harness (defaultOpen) sees the same content a click would produce.
  const current = open ? session || startDraft(programs, person.id, tomorrow()) : null;
  const draft = current && current.draft;
  const tree = useMemo(() => (draft ? listEditable(draft) : []), [draft]);

  const begin = () => {
    setSession(startDraft(programs, person.id, tomorrow()));
    setWhen(tomorrow());
    setResult(null);
    setPublished(null);
    setBlanks({});
    setOpen(true);
  };

  const [blanks, setBlanks] = useState({}); // required fields currently empty

  const apply = (fn) => {
    setResult(null);
    setPublished(null);
    setSession({ ...current, draft: fn(current.draft) });
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
          onClick={() => { setOpen(false); setSession(null); setResult(null); setBlanks({}); }}
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
            Based on: {current.baseName} (in force from {String(current.baseFrom)}). Edits existing blocks and
            exercises only; schedule, testing and daily sections carry over unchanged. Exercise IDs cannot be changed.{" "}
            <strong style={{ color: T.textSecondary }}>Publishing changes {person.name}'s app.</strong>
          </p>

          {tree.map(({ slot, blocks }) => (
            <div key={slot} className="mt-4">
              <p style={{ color: T.textSecondary }} className="text-[11px] font-bold uppercase tracking-wide">{slot}</p>
              {blocks.map((b) => (
                <div
                  key={b.key}
                  style={{ borderColor: T.border, opacity: b.retired ? 0.5 : 1 }}
                  className="rounded-lg border px-3 py-2 mt-2"
                >
                  <p style={{ color: T.textPrimary }} className="text-xs font-semibold">
                    {b.key}{b.retired ? " · retired (read-only)" : ""}
                  </p>
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
                      {b.exercises.map((e) => (
                        <div key={e.id} style={{ borderColor: T.border }} className="border-t mt-2 pt-2">
                          <p style={{ color: T.textMuted, fontFamily: FONT_MONO }} className="text-[10px] mb-1">
                            {e.id}{e.type ? " · " + e.type : ""}
                          </p>
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
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}

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
