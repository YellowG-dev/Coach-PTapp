// Programme edit model — pure functions over a definition. No React, no
// Supabase. Every function returns a NEW definition and never mutates its
// input. The result is handed to the existing preflight() → insertProgramVersion()
// path; nothing here validates, so nothing here can disagree with the client.
//
// Scope (3a): edit fields of existing blocks and exercises. (3b): add / remove /
// reorder exercises, add / retire / restore blocks, cardio targets, heart-rate
// zones and cardio types. Anything not named here — schedule, testing, daily,
// mobility, tracking, slotMeta, programView, … — passes through untouched.
// Blocks are never deleted: a retired block stays in `blocks` so history resolves.

import { resolveForDate } from "./program-schema.js";

export const BLOCK_FIELDS = ["label", "subtitle", "gentlerNote", "noGym"];
export const EXERCISE_FIELDS = [
  "name", "presc", "sets", "detail", "video", "pattern",
  "altName", "altVideo", "pctMin", "pctMax", "unit",
];
const OPTIONAL_BLOCK_TEXT = ["subtitle", "gentlerNote"];
const NUMERIC = ["sets", "pctMin", "pctMax"];

const clone = (o) => JSON.parse(JSON.stringify(o));

export const CARDIO_FIELDS = ["durationMin", "distanceKm", "zoneAvg", "zoneMax", "pace", "note", "durationTaskId"];
const CARDIO_NUMERIC = ["durationMin", "distanceKm"];
const NEW_EXERCISE_TYPES = ["exercise", "number"];

/** lowercase, a–z 0–9 and "-", no leading/trailing/double dashes, max 32 chars */
export function slugify(text) {
  return String(text === null || text === undefined ? "" : text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = "-" + n;
    const cand = base.slice(0, 32 - suffix.length).replace(/-+$/g, "") + suffix;
    if (!taken.has(cand)) return cand;
  }
}

const versionsOf = (rows, personId) =>
  (rows || [])
    .filter((r) => r && r.assigned_to === personId && r.definition)
    .sort((a, b) => {
      const ka = a.effective_from === "-infinity" ? "" : String(a.effective_from);
      const kb = b.effective_from === "-infinity" ? "" : String(b.effective_from);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

const eachExercise = (def, fn) => {
  Object.entries((def && def.blocks) || {}).forEach(([slot, group]) =>
    Object.entries(group || {}).forEach(([key, b]) => (b.exercises || []).forEach((e) => fn(e, slot, key)))
  );
};

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
      cardio: b.cardio && typeof b.cardio === "object" ? clone(b.cardio) : {},
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

/* ------------------------------ 3b: exercises ------------------------------ */

/**
 * Every distinct exercise this client has ever had, across all their versions,
 * one entry per id, the latest version's fields winning.
 */
export function catalogue(rows, personId) {
  const byId = new Map();
  versionsOf(rows, personId).forEach((r) =>
    eachExercise(r.definition, (e) => {
      if (e && typeof e.id === "string") byId.set(e.id, clone(e));
    })
  );
  return [...byId.values()];
}

/** Every exercise id in every version of this client, plus the ids in `loggedIds`. */
export function takenExerciseIds(rows, personId, loggedIds) {
  const ids = new Set(loggedIds || []);
  versionsOf(rows, personId).forEach((r) => eachExercise(r.definition, (e) => e && e.id && ids.add(e.id)));
  return ids;
}

/** Inserts a copy of a catalogue entry WITH ITS ORIGINAL id (same movement → history stays joined). */
export function addExistingExercise(def, slot, blockKey, entry, index) {
  if (!entry || typeof entry.id !== "string" || !entry.id) throw new Error("Catalogue entry has no id");
  const out = clone(def);
  const { block } = locate(out, slot, blockKey);
  if (!Array.isArray(block.exercises)) block.exercises = [];
  if (block.exercises.some((e) => e.id === entry.id)) throw new Error(`${entry.id} is already in ${slot}/${blockKey}`);
  const at = Number.isInteger(index) ? Math.max(0, Math.min(index, block.exercises.length)) : block.exercises.length;
  block.exercises.splice(at, 0, clone(entry));
  return out;
}

/**
 * Adds a brand-new exercise and mints its id: slugify(name), then -2, -3, …
 * until it is in neither `takenIds` (every id of every version + every logged
 * id — the caller builds it) nor anywhere in this draft.
 */
export function addNewExercise(def, slot, blockKey, fields, takenIds) {
  const f = fields || {};
  const name = f.name === null || f.name === undefined ? "" : String(f.name);
  if (!name.trim()) throw new Error("An exercise name cannot be empty");
  const type = f.type || "exercise";
  if (!NEW_EXERCISE_TYPES.includes(type)) throw new Error(`Exercise type not supported: ${type}`);
  if (type === "number" && !String(f.unit === undefined || f.unit === null ? "" : f.unit).trim()) {
    throw new Error("A number exercise needs a unit");
  }
  const base = slugify(name);
  if (!base) throw new Error("An exercise name needs at least one letter or digit");

  const out = clone(def);
  const { block } = locate(out, slot, blockKey);
  const taken = new Set(takenIds || []);
  eachExercise(out, (e) => e && e.id && taken.add(e.id));
  const ex = { id: uniqueSlug(base, taken), name };
  if (type === "number") ex.type = "number";
  EXERCISE_FIELDS.forEach((k) => {
    if (k === "name" || f[k] === undefined || f[k] === null || String(f[k]).trim() === "") return;
    if (NUMERIC.includes(k)) {
      const n = Number(f[k]);
      if (Number.isFinite(n) && n > 0) ex[k] = n;
    } else ex[k] = String(f[k]);
  });
  if (!Array.isArray(block.exercises)) block.exercises = [];
  block.exercises.push(ex);
  return out;
}

/** Removes the exercise from this block only; logs keep the id. */
export function removeExercise(def, slot, blockKey, exId) {
  const out = clone(def);
  const { block, idx } = locate(out, slot, blockKey, exId);
  block.exercises.splice(idx, 1);
  return out;
}

/** delta is +1 or −1; moving past either end is a no-op (clamped). */
export function moveExercise(def, slot, blockKey, exId, delta) {
  if (delta !== 1 && delta !== -1) throw new Error("delta must be +1 or -1");
  const out = clone(def);
  const { block, idx } = locate(out, slot, blockKey, exId);
  const to = Math.max(0, Math.min(block.exercises.length - 1, idx + delta));
  if (to !== idx) {
    const [ex] = block.exercises.splice(idx, 1);
    block.exercises.splice(to, 0, ex);
  }
  return out;
}

/* -------------------------------- 3b: blocks ------------------------------- */

const optionsOf = (def, slot) => {
  const list = def && def.slotOptions && def.slotOptions[slot];
  if (!Array.isArray(list)) throw new Error(`Slot ${slot} has no slotOptions`);
  return list;
};

/** New empty block; key = slugify(label), unique within the slot. */
export function addBlock(def, slot, label) {
  const text = label === null || label === undefined ? "" : String(label);
  if (!text.trim()) throw new Error("A block label cannot be empty");
  const base = slugify(text);
  if (!base) throw new Error("A block label needs at least one letter or digit");
  const out = clone(def);
  const opts = optionsOf(out, slot);
  if (!out.blocks || !out.blocks[slot]) throw new Error(`No slot ${slot} in blocks`);
  const taken = new Set([...Object.keys(out.blocks[slot]), ...opts.map((o) => o && o.value).filter((v) => typeof v === "string")]);
  const key = uniqueSlug(base, taken);
  out.blocks[slot][key] = { label: text, exercises: [] };
  opts.push({ label: text, value: key });
  return out;
}

/** Drops the block's slotOptions entry only. The block stays so past days resolve. */
export function retireBlock(def, slot, key) {
  const out = clone(def);
  locate(out, slot, key);
  const opts = optionsOf(out, slot);
  const i = opts.findIndex((o) => o && o.value === key);
  if (i < 0) throw new Error(`${slot}/${key} is already retired`);
  if (!opts.some((o, j) => j !== i && o && o.value !== null && o.value !== undefined)) {
    throw new Error(`${slot}/${key} is the last option in its slot and cannot be retired`);
  }
  opts.splice(i, 1);
  return out;
}

export function restoreBlock(def, slot, key) {
  const out = clone(def);
  const { block } = locate(out, slot, key);
  const opts = optionsOf(out, slot);
  if (opts.some((o) => o && o.value === key)) throw new Error(`${slot}/${key} is not retired`);
  opts.push({ label: block.label || key, value: key });
  return out;
}

/* ------------------------------ 3b: cardio shape ---------------------------- */

/** Merges a patch into block.cardio; empty values remove the field, an empty object removes cardio. */
export function setBlockCardio(def, slot, key, patch) {
  const out = clone(def);
  const { block } = locate(out, slot, key);
  const cardio = { ...(block.cardio || {}) };
  Object.entries(patch || {}).forEach(([f, value]) => {
    if (!CARDIO_FIELDS.includes(f)) throw new Error(`Cardio field not editable: ${f}`);
    const raw = value === null || value === undefined ? "" : String(value).trim();
    if (CARDIO_NUMERIC.includes(f)) {
      const n = Number(raw);
      if (raw !== "" && Number.isFinite(n) && n > 0) cardio[f] = n;
      else delete cardio[f];
    } else if (raw === "") delete cardio[f];
    else cardio[f] = raw;
  });
  if (Object.keys(cardio).length) block.cardio = cardio;
  else delete block.cardio;
  return out;
}

/** One zone table per client, % of max HR (decided 28 Sep 2026). */
export function standardHrZones() {
  return [
    { id: "PK1", label: "PK1", pctMin: 60, pctMax: 70 },
    { id: "PK2", label: "PK2", pctMin: 70, pctMax: 80 },
    { id: "VK", label: "VK", pctMin: 80, pctMax: 90 },
  ];
}

/** Replaces def.hrZones; an empty list removes it. Range/duplicate checks are the validator's job. */
export function setHrZones(def, zones) {
  const out = clone(def);
  const list = (Array.isArray(zones) ? zones : []).map((z) => ({
    id: String(z.id === undefined || z.id === null ? "" : z.id),
    label: String(z.label === undefined || z.label === null ? "" : z.label),
    pctMin: Number(z.pctMin),
    pctMax: Number(z.pctMax),
  }));
  if (list.length) out.hrZones = list;
  else delete out.hrZones;
  return out;
}

/** Replaces def.cardioTypes — { id, label, sports[], slot? }; an empty list removes it. */
export function setCardioTypes(def, types) {
  const out = clone(def);
  const list = (Array.isArray(types) ? types : []).map((t) => {
    const o = { id: String(t.id === undefined || t.id === null ? "" : t.id), label: String(t.label === undefined || t.label === null ? "" : t.label) };
    o.sports = (Array.isArray(t.sports) ? t.sports : []).map((s) => String(s).trim()).filter(Boolean);
    if (t.slot) o.slot = String(t.slot);
    return o;
  });
  if (list.length) out.cardioTypes = list;
  else delete out.cardioTypes;
  return out;
}
