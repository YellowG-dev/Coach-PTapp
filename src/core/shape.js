// Turning a stored day payload into something readable.
//
// Phase 1 is raw values only. Program definitions do not live in Supabase yet
// (that is Phase 5), so this file cannot turn "lg-1" into "Leg press" — there
// is nothing to look it up in. Exercise IDs are therefore shown as they are
// stored. Substitution names are the exception: the client typed those, so
// they travel inside the payload and can be shown as words.
//
// Second principle: nothing is silently dropped. Payload shapes have drifted
// over time — some days carry `weight`, newer ones carry `numbers["chk-weigh"]`;
// some carry `deload`, newer ones `gentler`. Anything this file does not
// recognise is collected and displayed as raw JSON rather than discarded. A
// coach reading yesterday's session should never be quietly shown less than
// the client actually recorded.

/** Keys consumed by the structured sections below. Anything else is surfaced raw. */
const KNOWN_KEYS = [
  "done", "loads", "subs", "exNotes", "numbers", "scales", "choices",
  "notes", "gentler", "deload", "weekType", "weight", "knee", "vo2max",
  "cardioHR", "nutrition",
];

/** Friendly labels for IDs that are stable across all three clients. */
const LABELS = {
  "chk-weigh": "Weigh-in",
  "chk-sleep": "Sleep",
  "chk-walk": "Steps target",
  "chk-water": "Water target",
  "chk-knee": "Knee",
  "chk-alcohol": "Alcohol",
  "chk-alc-units": "Alcohol units",
  "nut-cal": "Calories",
  "nut-pro": "Protein",
  "nut-fat": "Fat",
  "nut-carb": "Carbs",
  energy: "Energy",
  weight: "Weigh-in",
  knee: "Knee",
  vo2max: "VO2max",
  cardioHR: "Cardio HR",
};

const UNITS = {
  "chk-weigh": "kg",
  weight: "kg",
  "chk-sleep": "h",
  "nut-cal": "kcal",
  "nut-pro": "g",
  "nut-fat": "g",
  "nut-carb": "g",
  vo2max: "mL/kg/min",
  cardioHR: "bpm",
};

export function labelFor(id) {
  return LABELS[id] || id;
}

export function unitFor(id) {
  return UNITS[id] || "";
}

/** The one classification that holds across all three clients' programs. */
export function isDailyCheck(id) {
  return String(id).startsWith("chk-");
}

/**
 * Split a loads key into its base exercise and, if present, the substituted
 * movement. The client apps store a substitution's sets under
 * "<exerciseId>::<slug>" so the prescribed exercise's own history stays
 * unpolluted by whatever was done instead.
 */
function splitLoadKey(key) {
  const i = key.indexOf("::");
  if (i === -1) return { base: key, variant: null };
  return { base: key.slice(0, i), variant: key.slice(i + 2) };
}

function slugToWords(slug) {
  return String(slug).replace(/-/g, " ");
}

function hasAnySet(sets) {
  return (sets || []).some((s) => s && (s.w != null || s.r != null));
}

/** "70×8, 70×8, 70" — nulls and empty trailing sets dropped. */
export function formatSets(sets) {
  return (sets || [])
    .filter((s) => s && (s.w != null || s.r != null))
    .map((s) => {
      if (s.w != null && s.r != null) return `${s.w}×${s.r}`;
      if (s.w != null) return `${s.w}`;
      return `×${s.r}`;
    })
    .join(", ");
}

/**
 * The display model for one logged day.
 */
export function shapeDay(payload) {
  const p = payload || {};
  const done = p.done || {};
  const loads = p.loads || {};
  const subs = p.subs || {};
  const exNotes = p.exNotes || {};

  // --- exercises: anything with logged sets, a substitution, or a note ---
  const byBase = {};
  const touch = (id) => {
    if (!byBase[id]) byBase[id] = { id, sets: [], variants: [], sub: null, note: null, done: null };
    return byBase[id];
  };

  Object.keys(loads).forEach((key) => {
    const { base, variant } = splitLoadKey(key);
    const entry = touch(base);
    const sets = normaliseSets(loads[key]);
    if (!hasAnySet(sets)) return;
    if (variant) entry.variants.push({ slug: variant, label: slugToWords(variant), sets });
    else entry.sets = sets;
  });

  Object.keys(subs).forEach((id) => {
    const s = subs[id];
    if (s && s.name) touch(id).sub = { name: s.name, reason: s.reason || null };
  });

  Object.keys(exNotes).forEach((id) => {
    if (exNotes[id]) touch(id).note = exNotes[id];
  });

  Object.keys(byBase).forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(done, id)) byBase[id].done = Boolean(done[id]);
  });

  const exercises = Object.values(byBase)
    .filter((e) => hasAnySet(e.sets) || e.variants.length > 0 || e.sub || e.note)
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- everything else that was ticked, that isn't already shown above ---
  //
  // These IDs cannot be resolved to names until programs live in Supabase
  // (Phase 5), but one thing *is* knowable now: the "chk-" prefix marks a
  // daily habit check across all three clients. Everything else is an
  // exercise the person completed without recording loads. Lumping the two
  // together makes a six-exercise session read as one exercise plus noise,
  // so they are separated on the only evidence available rather than guessed.
  const shown = new Set(exercises.map((e) => e.id));
  const checks = [];
  const ticked = [];
  const unchecked = [];
  Object.keys(done).forEach((id) => {
    if (shown.has(id)) return;
    if (!done[id]) {
      unchecked.push(id);
      return;
    }
    (isDailyCheck(id) ? checks : ticked).push(id);
  });
  checks.sort();
  ticked.sort();
  unchecked.sort();

  // --- measurements: new-style `numbers` plus the older loose scalars ---
  const measurements = [];
  Object.keys(p.numbers || {}).forEach((id) => {
    if (p.numbers[id] != null) measurements.push({ id, value: p.numbers[id] });
  });
  if (typeof p.weight === "number") measurements.push({ id: "weight", value: p.weight });
  if (typeof p.vo2max === "number") measurements.push({ id: "vo2max", value: p.vo2max });
  if (typeof p.cardioHR === "number") measurements.push({ id: "cardioHR", value: p.cardioHR });
  if (p.nutrition && typeof p.nutrition === "object") {
    Object.keys(p.nutrition).forEach((k) => {
      if (p.nutrition[k] != null) measurements.push({ id: "nut-" + k, value: p.nutrition[k] });
    });
  }
  measurements.sort((a, b) => labelFor(a.id).localeCompare(labelFor(b.id)));

  // --- ratings and picked options ---
  const ratings = [];
  Object.keys(p.scales || {}).forEach((id) => {
    if (p.scales[id] != null) ratings.push({ id, value: p.scales[id] });
  });
  if (typeof p.knee === "string") ratings.push({ id: "knee", value: p.knee });
  Object.keys(p.choices || {}).forEach((id) => {
    if (p.choices[id] != null) ratings.push({ id, value: p.choices[id] });
  });
  ratings.sort((a, b) => labelFor(a.id).localeCompare(labelFor(b.id)));

  // --- flags and anything unrecognised ---
  const gentler = p.gentler === true || p.deload === true;
  const unknown = {};
  Object.keys(p).forEach((k) => {
    if (!KNOWN_KEYS.includes(k)) unknown[k] = p[k];
  });

  // An explicitly unticked item is a recorded fact — the person opened the day
  // and cleared something. Counting only ticked items here would let a card
  // claim "nothing was recorded" while also listing what was left unticked.
  const isEmpty =
    exercises.length === 0 &&
    checks.length === 0 &&
    ticked.length === 0 &&
    unchecked.length === 0 &&
    measurements.length === 0 &&
    ratings.length === 0 &&
    !p.notes &&
    Object.keys(unknown).length === 0;

  return {
    exercises,
    checks,
    ticked,
    unchecked,
    measurements,
    ratings,
    notes: p.notes || null,
    gentler,
    weekType: p.weekType || null,
    unknown: Object.keys(unknown).length ? unknown : null,
    isEmpty,
  };
}

/** Sets are stored as {w,r} objects now, but bare numbers exist in older rows. */
function normaliseSets(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => (typeof e === "number" ? { w: e, r: null } : { w: e?.w ?? null, r: e?.r ?? null }));
}

/**
 * The display model for one day's schedule changes.
 *
 * Slot keys are program-specific (strength, cardio, tennis, …) so they are
 * read generically rather than from a fixed list. A null value means the slot
 * was cleared for that day; a string means it was switched to that block.
 */
export function shapeOverride(payload) {
  const p = payload || {};
  const slots = [];
  const tests = [];
  let skip = null;
  let activities = [];

  Object.keys(p).forEach((key) => {
    const v = p[key];
    if (key === "skip") {
      if (v) skip = typeof v === "string" ? v : "skipped";
      return;
    }
    if (key === "activities") {
      activities = Array.isArray(v) ? v.filter((a) => a && a.name) : [];
      return;
    }
    if (key.startsWith("test:") || key.startsWith("test")) {
      const name = key.replace(/^test:?/i, "").replace(/^inbody$/i, "InBody").replace(/^vo2max$/i, "VO2max");
      tests.push({ name: name || key, due: Boolean(v) });
      return;
    }
    slots.push({ slot: key, value: v == null ? null : String(v) });
  });

  slots.sort((a, b) => a.slot.localeCompare(b.slot));
  const isEmpty = !slots.length && !tests.length && !skip && !activities.length;
  return { slots, tests, skip, activities, isEmpty };
}

export function formatDay(dayString) {
  const [y, m, d] = String(dayString).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "long" }),
    full: date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
  };
}
