// Programme edit model — pure functions over a definition. No React, no
// Supabase. Every function returns a NEW definition and never mutates its
// input. The result is handed to the existing preflight() → insertProgramVersion()
// path; nothing here validates, so nothing here can disagree with the client.
//
// Scope (Phase 3a): edit fields of EXISTING blocks and exercises. Anything not
// named here — schedule, testing, daily, mobility, tracking, slotMeta,
// slotOptions, programView, … — passes through untouched.

import { resolveForDate } from "./program-schema.js";

export const BLOCK_FIELDS = ["label", "subtitle", "gentlerNote", "noGym"];
export const EXERCISE_FIELDS = [
  "name", "presc", "sets", "detail", "video", "pattern",
  "altName", "altVideo", "pctMin", "pctMax", "unit",
];
const OPTIONAL_BLOCK_TEXT = ["subtitle", "gentlerNote"];
const NUMERIC = ["sets", "pctMin", "pctMax"];

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Deep copy of the definition in force for one client on `date`.
 * @returns {{ draft, baseId, baseName, baseFrom } | { draft: null, reason }}
 */
export function startDraft(rows, personId, date) {
  const mine = (rows || []).filter((r) => r && r.assigned_to === personId);
  if (!mine.length) return { draft: null, reason: "This client has no programme version at all." };
  const base = resolveForDate(mine, date);
  if (!base || !base.definition) return { draft: null, reason: `No programme version is in force on ${String(date)}.` };
  return {
    draft: clone(base.definition),
    baseId: base.id,
    baseName: base.name,
    baseFrom: base.effective_from,
  };
}

function locate(def, slot, blockKey, exId) {
  const block = def && def.blocks && def.blocks[slot] && def.blocks[slot][blockKey];
  if (!block) throw new Error(`No block ${slot}/${blockKey}`);
  if (exId === undefined) return { block };
  const idx = (block.exercises || []).findIndex((e) => e.id === exId);
  if (idx < 0) throw new Error(`No exercise ${exId} in ${slot}/${blockKey}`);
  return { block, idx };
}

export function setBlockField(def, slot, blockKey, field, value) {
  if (!BLOCK_FIELDS.includes(field)) throw new Error(`Block field not editable: ${field}`);
  const out = clone(def);
  const { block } = locate(out, slot, blockKey);
  if (field === "noGym") {
    if (value) block.noGym = true;
    else delete block.noGym;
    return out;
  }
  const v = value === null || value === undefined ? "" : String(value);
  if (field === "label") {
    if (!v.trim()) throw new Error("A block label cannot be empty");
    block.label = v;
  } else if (OPTIONAL_BLOCK_TEXT.includes(field)) {
    if (v === "") delete block[field];
    else block[field] = v;
  }
  return out;
}

export function setExerciseField(def, slot, blockKey, exId, field, value) {
  if (field === "id" || field === "type") throw new Error(`Exercise field not editable: ${field} (IDs are permanent)`);
  if (!EXERCISE_FIELDS.includes(field)) throw new Error(`Exercise field not editable: ${field}`);
  const out = clone(def);
  const { block, idx } = locate(out, slot, blockKey, exId);
  const ex = block.exercises[idx];
  if (NUMERIC.includes(field)) {
    const n = typeof value === "number" ? value : Number(String(value === null || value === undefined ? "" : value).trim());
    if (String(value).trim() !== "" && Number.isFinite(n) && n > 0) ex[field] = n;
    else delete ex[field];
    return out;
  }
  const v = value === null || value === undefined ? "" : String(value);
  if (field === "name") {
    if (!v.trim()) throw new Error("An exercise name cannot be empty");
    ex.name = v;
  } else if (v === "") delete ex[field];
  else ex[field] = v;
  return out;
}

/**
 * The tree the UI renders: slots in def.slots order → blocks → exercises.
 * A block is retired when its key is not a `value` in slotOptions[slot]; it is
 * listed, marked, and read-only in the UI (history still resolves against it).
 */
export function listEditable(def) {
  const slots = Array.isArray(def && def.slots) ? def.slots : [];
  const opts = (def && def.slotOptions) || {};
  return slots.map((slot) => {
    const live = new Set((opts[slot] || []).map((o) => o && o.value).filter((v) => v !== null && v !== undefined));
    const blocks = Object.entries((def.blocks && def.blocks[slot]) || {}).map(([key, b]) => ({
      key,
      retired: !live.has(key),
      label: b.label || "",
      subtitle: b.subtitle || "",
      gentlerNote: b.gentlerNote || "",
      noGym: Boolean(b.noGym),
      exercises: (b.exercises || []).map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name || "",
        presc: e.presc || "",
        sets: e.sets === null || e.sets === undefined ? "" : e.sets,
        detail: e.detail || "",
        video: e.video || "",
        pattern: e.pattern || "",
        altName: e.altName || "",
        altVideo: e.altVideo || "",
        pctMin: e.pctMin === undefined ? "" : e.pctMin,
        pctMax: e.pctMax === undefined ? "" : e.pctMax,
        unit: e.unit || "",
      })),
    }));
    return { slot, blocks };
  });
}
