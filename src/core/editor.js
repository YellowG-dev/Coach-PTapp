// Programme edit model — pure functions over a definition. No React, no
// Supabase. Every function returns a NEW definition and never mutates its
// input. The result is handed to the existing preflight() → insertProgramVersion()
// path; nothing here validates, so nothing here can disagree with the client.
//
// Scope (3a): edit fields of existing blocks and exercises. (3b): add / remove /
// reorder exercises, add / retire / restore blocks, cardio targets, heart-rate
// zones and cardio types. Anything not named here — schedule, testing, daily,
// mobility, tracking, slotMeta, programView, … — passes through untouched.
// (3c): the weekly schedule, picker labels, a change list, and draft storage.
// (Phase 6): add a slot from the standard catalogue (or a custom one), cardio-type
// helpers. A slot is never renamed or removed.
// Blocks are never deleted: a retired block stays in `blocks` so history resolves.

import { resolveForDate, STANDARD_SLOTS, NON_CARDIO_SLOTS, KNOWN_SPORTS } from "./program-schema.js";
import { getISOWeek } from "./dates.js";

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
      optionLabel: ((opts[slot] || []).find((o) => o && o.value === key) || {}).label || "",
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

/* ---------------------------- Phase 6: slots ------------------------------- */

const SLOT_ID = /^[a-z][a-z0-9-]{0,31}$/;
const SLOT_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The catalogue slots this programme does not have yet, in catalogue order. */
export function availableStandardSlots(def) {
  const have = new Set(Array.isArray(def && def.slots) ? def.slots : []);
  return STANDARD_SLOTS.filter((s) => !have.has(s.id));
}

/** Does this slot count toward the weekly cardio total? Strength and yoga do not; every other slot, standard or custom, does. */
export function slotCountsAsCardio(slot) {
  return !NON_CARDIO_SLOTS.includes(slot);
}

/** The slots of a programme that count as cardio — the ones a cardio type may link to. */
export function cardioSlots(def) {
  return (Array.isArray(def && def.slots) ? def.slots : []).filter(slotCountsAsCardio);
}

/**
 * Appends a slot. `spec` is `{ id, label, color }`: for a standard slot pass
 * `standardSlotSpec(id)`, for a client-specific one (Juha's tennis) whatever the
 * coach typed. Writes `slots`, `slotMeta[id]`, `blocks[id] = {}` and
 * `slotOptions[id] = [{ label: "None", value: null }]`, so the slot validates the
 * moment it exists and "+ Add block" works on it straight away.
 *
 * An existing id throws: ids are permanent (logged history resolves through
 * them), so a slot can be added but never renamed or replaced. Removing a slot
 * is deliberately not an operation.
 */
export function addSlot(def, spec) {
  const id = spec && typeof spec.id === "string" ? spec.id : "";
  const label = spec && typeof spec.label === "string" ? spec.label.trim() : "";
  const color = spec && typeof spec.color === "string" ? spec.color : "";
  if (!SLOT_ID.test(id)) throw new Error("A slot id is lowercase letters, digits and '-', starting with a letter, up to 32 characters");
  if (!label) throw new Error("A slot needs a label");
  if (!SLOT_COLOR.test(color)) throw new Error("A slot colour must be a #rrggbb hex value");
  const out = clone(def);
  const slots = Array.isArray(out.slots) ? out.slots : (out.slots = []);
  const taken = (m) => m && Object.prototype.hasOwnProperty.call(m, id);
  if (slots.includes(id) || taken(out.blocks) || taken(out.slotMeta) || taken(out.slotOptions)) {
    throw new Error(`Slot ${id} already exists and cannot be added again`);
  }
  slots.push(id);
  out.slotMeta = { ...(out.slotMeta || {}), [id]: { label, color } };
  out.blocks = { ...(out.blocks || {}), [id]: {} };
  out.slotOptions = { ...(out.slotOptions || {}), [id]: [{ label: "None", value: null }] };
  return out;
}

/** `{ id, label, color }` for a catalogue slot, ready for addSlot. */
export function standardSlotSpec(id) {
  const s = STANDARD_SLOTS.find((x) => x.id === id);
  if (!s) throw new Error(`${id} is not a standard slot`);
  return { id: s.id, label: s.label, color: s.color };
}

/** Standard slot, by id: the picker's common case. */
export function addStandardSlot(def, id) {
  return addSlot(def, standardSlotSpec(id));
}

/* -------------------------------- 3b: blocks ------------------------------- */

const optionsOf = (def, slot) => {
  const list = def && def.slotOptions && def.slotOptions[slot];
  if (!Array.isArray(list)) throw new Error(`Slot ${slot} has no slotOptions`);
  return list;
};

/** New empty block; key = slugify(label), unique within the slot. */
export function addBlock(def, slot, label, shortLabel) {
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
  const short = shortLabel === undefined || shortLabel === null || !String(shortLabel).trim() ? text : String(shortLabel);
  opts.push({ label: short, value: key });
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

export function restoreBlock(def, slot, key, shortLabel) {
  const out = clone(def);
  const { block } = locate(out, slot, key);
  const opts = optionsOf(out, slot);
  if (opts.some((o) => o && o.value === key)) throw new Error(`${slot}/${key} is not retired`);
  const short = shortLabel === undefined || shortLabel === null || !String(shortLabel).trim() ? block.label || key : String(shortLabel);
  opts.push({ label: short, value: key });
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

/**
 * The "Use standard cardio types" button: Run, Walk, Bike, Swim and Cardio from
 * the catalogue. Each is linked to its slot when the programme has that slot,
 * otherwise extras-only. Types the programme already has are kept as they are
 * (matched by id), so pressing the button never overwrites the coach's edits.
 */
export function useStandardCardioTypes(def) {
  const have = new Set(Array.isArray(def && def.slots) ? def.slots : []);
  const existing = Array.isArray(def && def.cardioTypes) ? def.cardioTypes : [];
  const ids = new Set(existing.map((t) => t && t.id));
  const added = STANDARD_SLOTS
    .filter((s) => s.countsAsCardio && s.id !== "strength" && !ids.has(s.id))
    .map((s) => (have.has(s.id) ? { id: s.id, label: s.label, sports: [...s.sports], slot: s.id } : { id: s.id, label: s.label, sports: [...s.sports] }));
  return setCardioTypes(def, [...existing, ...added]);
}

/**
 * Sport codes the editor offers in its multi-select. Strength and yoga sports are
 * left out: the validator rejects them as cardio types. A code outside the list is
 * a custom one, which the validator warns about.
 */
export const SPORT_CHOICES = KNOWN_SPORTS.filter((c) => !STANDARD_SLOTS.some((s) => !s.countsAsCardio && s.sports.includes(c)));

/** What the validator would say about a typed sport code: `{ error }`, `{ warning }` or null. Same wording as program-schema.js. */
export function sportProblem(code) {
  const c = String(code === undefined || code === null ? "" : code).trim();
  if (!c) return null;
  if (STANDARD_SLOTS.some((s) => !s.countsAsCardio && s.sports.includes(c))) {
    return { error: `"${c}" is not cardio — strength and yoga are never cardio types` };
  }
  if (!KNOWN_SPORTS.includes(c)) {
    return { warning: `"${c}" is not a known watch-sport code — it will only match if a watch reports exactly that` };
  }
  return null;
}

/* ---------------------------- 3c: weekly schedule --------------------------- */

const WEEKS = ["A", "B"];
const DOWS = ["0", "1", "2", "3", "4", "5", "6"];
/** Monday first — the order the UI and the change list use. */
export const DOW_ORDER = ["1", "2", "3", "4", "5", "6", "0"];
export const DOW_NAMES = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

const liveKeys = (def, slot) =>
  ((def && def.slotOptions && def.slotOptions[slot]) || []).map((o) => o && o.value).filter((v) => typeof v === "string");

/** Sets one cell of the default week. `blockKey` must be a live block of the slot, or null (written explicitly). */
export function setScheduleCell(def, week, dow, slot, blockKey) {
  if (!WEEKS.includes(week)) throw new Error(`Week must be A or B (got ${week})`);
  if (!DOWS.includes(String(dow))) throw new Error(`Day must be "0"…"6" (got ${dow})`);
  if (!Array.isArray(def && def.slots) || !def.slots.includes(slot)) throw new Error(`Unknown slot: ${slot}`);
  const key = blockKey === undefined || blockKey === "" ? null : blockKey;
  if (key !== null && !liveKeys(def, slot).includes(key)) {
    throw new Error(`${slot}/${key} is not a live block (retired or unknown)`);
  }
  const out = clone(def);
  if (!out.schedule) out.schedule = {};
  if (!out.schedule[week]) out.schedule[week] = {};
  const day = out.schedule[week][String(dow)] || (out.schedule[week][String(dow)] = {});
  day[slot] = key;
  return out;
}

/**
 * Moves the block in `fromDow`'s `slot` to `toDow`; if `toDow` already holds a
 * block in that slot the two swap. Same day → the definition unchanged (same
 * object contents). Empty source → throws. Built on setScheduleCell, so its
 * week/day/slot checks apply. A block that is already in the schedule may be
 * moved even if it has since been retired — only placing a retired block from
 * the library (setScheduleCell) is refused.
 */
export function moveScheduleCell(def, week, fromDow, toDow, slot) {
  const from = String(fromDow), to = String(toDow);
  const at = (d, dow) => (d && d.schedule && d.schedule[week] && d.schedule[week][dow] && d.schedule[week][dow][slot]) || null;
  // Validation of week / days / slot, and the source read, go through the same checks.
  setScheduleCell(def, week, from, slot, null);
  setScheduleCell(def, week, to, slot, null);
  const moving = at(def, from);
  if (!moving) throw new Error(`Nothing to move: ${DOW_NAMES[from]} has no ${slot} block in Week ${week}`);
  if (from === to) return clone(def);
  const displaced = at(def, to);
  const put = (d, dow, key) => {
    if (key === null || liveKeys(d, slot).includes(key)) return setScheduleCell(d, week, dow, slot, key);
    // already in the schedule but retired: relocate without re-validating liveness
    const out = setScheduleCell(d, week, dow, slot, null);
    out.schedule[week][String(dow)][slot] = key;
    return out;
  };
  let out = put(def, from, displaced);
  out = put(out, to, moving);
  return out;
}

/** Sets the day's note; empty removes it. */
export function setDayNote(def, week, dow, text) {
  if (!WEEKS.includes(week)) throw new Error(`Week must be A or B (got ${week})`);
  if (!DOWS.includes(String(dow))) throw new Error(`Day must be "0"…"6" (got ${dow})`);
  const out = clone(def);
  if (!out.schedule) out.schedule = {};
  if (!out.schedule[week]) out.schedule[week] = {};
  const day = out.schedule[week][String(dow)] || (out.schedule[week][String(dow)] = {});
  const v = text === null || text === undefined ? "" : String(text);
  if (v.trim() === "") delete day.note;
  else day.note = v;
  return out;
}

/** Deep copy of one week onto the other. */
export function copyWeek(def, from, to) {
  if (!WEEKS.includes(from) || !WEEKS.includes(to) || from === to) throw new Error("copyWeek needs two different weeks, A and B");
  const out = clone(def);
  if (!out.schedule || !out.schedule[from]) throw new Error(`schedule.${from} is missing`);
  out.schedule[to] = clone(out.schedule[from]);
  return out;
}

/** "A" | "B" for a YYYY-MM-DD date — the engine's rule (ISO week even → A). */
export function weekFor(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${dateStr}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return getISOWeek(d) % 2 === 0 ? "A" : "B";
}

/* ------------------------------ 3c: picker labels --------------------------- */

/** Changes the slotOptions label (the short label in the client's picker) of a live block. */
export function setOptionLabel(def, slot, key, label) {
  const v = label === null || label === undefined ? "" : String(label);
  if (!v.trim()) throw new Error("A picker label cannot be empty");
  const out = clone(def);
  locate(out, slot, key);
  const opt = optionsOf(out, slot).find((o) => o && o.value === key);
  if (!opt) throw new Error(`${slot}/${key} is retired; restore it first`);
  opt.label = v;
  return out;
}

/* ---------------------------------- 3c: diff -------------------------------- */

const show = (v) => (v === undefined || v === null || v === "" ? "—" : typeof v === "string" ? `"${v}"` : JSON.stringify(v));
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const CARDIO_LABEL = {
  durationMin: ["duration", " min"], distanceKm: ["distance", " km"], zoneAvg: ["avg zone", ""], zoneMax: ["max zone", ""],
  pace: ["pace", ""], note: ["note", ""], durationTaskId: ["duration field", ""],
};
const cell = (def, week, dow, slot) => {
  const v = def && def.schedule && def.schedule[week] && def.schedule[week][dow] && def.schedule[week][dow][slot];
  return v === undefined ? null : v;
};

function scheduleLines(base, draft) {
  const out = [];
  const slots = [...new Set([...(base.slots || []), ...(draft.slots || [])])];
  for (const w of WEEKS) {
    for (const slot of slots) {
      const removed = [], added = [];
      for (const d of DOW_ORDER) {
        const a = cell(base, w, d, slot), b = cell(draft, w, d, slot);
        if (a === b) continue;
        if (a !== null && b !== null) out.push(`Schedule ${w} · ${DOW_NAMES[d]}: ${slot} ${a} → ${b}`);
        else if (a !== null) removed.push([d, a]);
        else added.push([d, b]);
      }
      // a block that left one day and appeared on another is one move
      for (const [d, key] of removed) {
        const j = added.findIndex(([, k]) => k === key);
        if (j >= 0) {
          out.push(`Schedule ${w} · ${slot} ${key}: ${DOW_NAMES[d]} → ${DOW_NAMES[added[j][0]]}`);
          added.splice(j, 1);
        } else out.push(`Schedule ${w} · ${DOW_NAMES[d]}: ${slot} ${key} → —`);
      }
      added.forEach(([d, key]) => out.push(`Schedule ${w} · ${DOW_NAMES[d]}: ${slot} — → ${key}`));
    }
    for (const d of DOW_ORDER) {
      const a = base.schedule && base.schedule[w] && base.schedule[w][d] && base.schedule[w][d].note;
      const b = draft.schedule && draft.schedule[w] && draft.schedule[w][d] && draft.schedule[w][d].note;
      if (!same(a, b)) out.push(`Schedule ${w} · ${DOW_NAMES[d]}: note changed`);
    }
  }
  return out;
}

/** Ids that stayed in place: everything outside a longest increasing run is "moved". */
function movedIds(baseIds, draftIds) {
  const common = draftIds.filter((id) => baseIds.includes(id));
  const idx = common.map((id) => baseIds.indexOf(id));
  const best = idx.map(() => 1), prev = idx.map(() => -1);
  for (let i = 0; i < idx.length; i++) for (let j = 0; j < i; j++) if (idx[j] < idx[i] && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; }
  let end = best.length ? best.indexOf(Math.max(...best)) : -1;
  const keep = new Set();
  for (let i = end; i >= 0; i = prev[i]) keep.add(common[i]);
  return common.filter((id) => !keep.has(id));
}

/**
 * The plain list the coach reads before publishing. Order: schedule, blocks,
 * exercises, cardio, labels. Nothing is listed for what did not change.
 */
export function diffDefinitions(base, draft) {
  const b0 = base || {}, d0 = draft || {};
  const lines = scheduleLines(b0, d0);
  const blockLines = [], exLines = [], cardioLines = [], labelLines = [];
  const slots = [...new Set([...(b0.slots || []), ...(d0.slots || [])])];
  for (const slot of slots) {
    const bb = (b0.blocks && b0.blocks[slot]) || {}, db = (d0.blocks && d0.blocks[slot]) || {};
    const liveB = new Set(liveKeys(b0, slot)), liveD = new Set(liveKeys(d0, slot));
    for (const key of Object.keys(db)) {
      const at = `${slot}/${key}`;
      const nb = bb[key], nd = db[key];
      if (!nb) {
        blockLines.push(`Block added: ${at} ${show(nd.label)}`);
      } else {
        if (liveB.has(key) && !liveD.has(key)) blockLines.push(`Block retired: ${at}`);
        if (!liveB.has(key) && liveD.has(key)) blockLines.push(`Block restored: ${at}`);
        for (const f of BLOCK_FIELDS) {
          if (!same(nb[f], nd[f])) blockLines.push(`Block ${at} ${f}: ${show(nb[f])} → ${show(nd[f])}`);
        }
      }
      // exercises
      const be = (nb && nb.exercises) || [], de = nd.exercises || [];
      const byId = new Map(be.map((e) => [e.id, e]));
      const dIds = new Set(de.map((e) => e.id));
      de.forEach((e) => {
        const o = byId.get(e.id);
        if (!o) { exLines.push(`Exercise added to ${at}: ${e.name} (${e.id})`); return; }
        const fields = [...new Set([...Object.keys(o), ...Object.keys(e)])].filter((f) => f !== "id");
        fields.forEach((f) => { if (!same(o[f], e[f])) exLines.push(`Field changed in ${at}: ${e.name} (${e.id}) ${f} ${show(o[f])} → ${show(e[f])}`); });
      });
      be.forEach((e) => { if (!dIds.has(e.id)) exLines.push(`Exercise removed from ${at}: ${e.name} (${e.id})`); });
      movedIds(be.map((e) => e.id), de.map((e) => e.id)).forEach((id) => {
        const e = de.find((x) => x.id === id);
        exLines.push(`Exercise moved in ${at}: ${e.name} (${id})`);
      });
      // cardio target
      const ca = (nb && nb.cardio) || {}, cd = nd.cardio || {};
      [...new Set([...Object.keys(ca), ...Object.keys(cd)])].forEach((f) => {
        if (same(ca[f], cd[f])) return;
        const [name, unit] = CARDIO_LABEL[f] || [f, ""];
        cardioLines.push(`Cardio target ${at}: ${name} ${ca[f] === undefined ? "—" : ca[f]} → ${cd[f] === undefined ? "—" : cd[f] + unit}`);
      });
      // picker label (blocks live on both sides)
      if (nb && liveB.has(key) && liveD.has(key)) {
        const la = (b0.slotOptions[slot].find((o) => o && o.value === key) || {}).label;
        const ld = (d0.slotOptions[slot].find((o) => o && o.value === key) || {}).label;
        if (!same(la, ld)) labelLines.push(`Picker label ${at}: ${show(la)} → ${show(ld)}`);
      }
    }
  }
  if (!same(b0.hrZones, d0.hrZones)) cardioLines.push("Zones changed");
  if (!same(b0.cardioTypes, d0.cardioTypes)) cardioLines.push("Cardio types changed");
  return [...lines, ...blockLines, ...exLines, ...cardioLines, ...labelLines];
}

/* ------------------------------ 3c: saved drafts ---------------------------- */
// `storage` is a Storage-like object ({ getItem, setItem, removeItem }), so the
// model can be tested with stubs. Every call is guarded: no storage, or storage
// that throws, means "nothing saved" — never an error.

export const draftKey = (personId) => `coachDraft_${personId}`;

export function saveDraft(storage, personId, baseId, draft, now) {
  try {
    storage.setItem(draftKey(personId), JSON.stringify({ baseId, savedAt: now || new Date().toISOString(), draft }));
    return true;
  } catch (e) {
    return false;
  }
}

/** @returns {{ baseId, savedAt, draft } | null} */
export function loadDraft(storage, personId) {
  try {
    const raw = storage.getItem(draftKey(personId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === "object" && o.draft && typeof o.draft === "object" && typeof o.baseId === "string" ? o : null;
  } catch (e) {
    return null;
  }
}

export function clearDraft(storage, personId) {
  try {
    storage.removeItem(draftKey(personId));
    return true;
  } catch (e) {
    return false;
  }
}

/** "resume" if the saved draft was made on the version now in force, else "stale" (someone published meanwhile). */
export function draftStatus(saved, currentBaseId) {
  return saved && saved.baseId === currentBaseId ? "resume" : "stale";
}
