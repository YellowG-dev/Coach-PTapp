// Program edit validator — exercise-ID permanence.
//
// THE RULE: an exercise ID is permanent and movement-specific. Logged history
// is keyed by ID and stores no exercise name, so if "lg-3" stops meaning
// Bulgarian split squat and starts meaning leg press, every past entry under
// lg-3 silently becomes wrong. The sets survive; their meaning does not. That
// is unrecoverable without guessing, and nothing in the apps prevents it.
//
// This module compares a proposed program against the current one and the IDs
// that already appear in that client's logs, and reports what would break.
// It decides nothing on its own — Phase 7 decides what to do with `blocking`.
//
// Severity, and why removal is not treated like reuse:
//
//   block — would corrupt existing history. Reuse of an ID that has been
//           logged. There is no safe way to proceed; the edit needs a new ID.
//   warn  — would leave history intact but unlabelled, or looks like reuse of
//           an ID nobody has logged yet. A human should look, then decide.
//   info  — worth stating, nothing at risk.
//
// A note on how "different movement" is judged. Where both versions declare a
// `movement` reference, the comparison is exact and this module is certain.
// Where they do not — which is every entry today — it falls back to comparing
// names, and that is a heuristic. It is tuned to be loud about real reuse
// ("Incline dumbbell press" -> "Front or goblet squat") and quiet about
// editing wording or a target ("Drink 3 L water" -> "Drink 2 L water"), but a
// heuristic is what it is. Adding `movement` refs is what makes it exact.

const SIMILARITY_BLOCK_THRESHOLD = 0.5;

/* ------------------------------ ID collection ----------------------------- */

/**
 * Every { id, name } pair anywhere in a program.
 *
 * Walks the whole structure rather than known paths, because programs are
 * plain data with several shapes — blocks, daily tasks, testing tasks,
 * mobility — and a validator that only looked where it expected to would miss
 * exactly the edit nobody reviewed.
 */
export function collectProgramIds(program) {
  const found = new Map();
  const seen = new Set();

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return; // shared references are legal; cycles are not a crash
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node.id === "string") {
      const entry = {
        id: node.id,
        name: typeof node.name === "string" ? node.name : null,
        movement: typeof node.movement === "string" ? node.movement : null,
      };
      const prior = found.get(node.id);
      if (prior) prior.duplicates.push(entry);
      else found.set(node.id, { ...entry, duplicates: [] });
    }
    Object.keys(node).forEach((k) => walk(node[k]));
  };

  walk(program);
  return found;
}

/**
 * Every ID that appears anywhere in logged history.
 *
 * Takes the raw day payloads. Substituted sets are stored under
 * "<id>::<slug>" keys, so those are split back to the base ID — the
 * substitution is not itself a program ID and must not be reported as one.
 */
export function collectLoggedIds(payloads) {
  const ids = new Set();
  const add = (key) => {
    if (typeof key !== "string" || !key) return;
    const i = key.indexOf("::");
    ids.add(i === -1 ? key : key.slice(0, i));
  };

  (payloads || []).forEach((p) => {
    if (!p || typeof p !== "object") return;
    ["done", "loads", "subs", "exNotes", "numbers", "scales", "choices"].forEach((bucket) => {
      const obj = p[bucket];
      if (obj && typeof obj === "object" && !Array.isArray(obj)) Object.keys(obj).forEach(add);
    });
  });

  return ids;
}

/* ------------------------------- Comparison ------------------------------- */

function normalise(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9åäö\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Token overlap, 0 to 1. Used only as a fallback when `movement` is absent. */
export function nameSimilarity(a, b) {
  const ta = new Set(normalise(a));
  const tb = new Set(normalise(b));
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared += 1;
  });
  return shared / (ta.size + tb.size - shared);
}

/**
 * Validate a proposed program against the current one and logged history.
 *
 * @param {object} current   the program in force now
 * @param {object} next      the proposed program
 * @param {Set|Array} logged IDs already present in this client's logs
 * @returns {{ ok, blocking, findings, summary }}
 */
export function validateProgramEdit(current, next, logged) {
  const loggedIds = logged instanceof Set ? logged : new Set(logged || []);
  const before = collectProgramIds(current);
  const after = collectProgramIds(next);
  const findings = [];

  const say = (severity, code, id, message, detail) =>
    findings.push({ severity, code, id, message, detail: detail || null });

  // --- an ID declared twice in the proposed program -------------------------
  //
  // Repetition on its own is legitimate and common: one exercise appears in
  // both an upper and a full-body block, and a nutrition task appears in both
  // the training-day and rest-day variant. Those are the same thing declared
  // in two places, and history cannot be confused by them. What is dangerous
  // is the same ID declared with two different meanings in one program — then
  // no reader, human or machine, can say what a logged entry referred to.
  after.forEach((entry, id) => {
    if (!entry.duplicates.length) return;
    const names = [entry.name, ...entry.duplicates.map((d) => d.name)].filter(Boolean);
    const movements = [entry.movement, ...entry.duplicates.map((d) => d.movement)].filter(Boolean);
    const distinctNames = Array.from(new Set(names));
    const distinctMovements = Array.from(new Set(movements));
    if (distinctNames.length <= 1 && distinctMovements.length <= 1) return; // same thing, twice
    say(
      "block",
      "duplicate-id",
      id,
      `"${id}" is declared ${names.length} times with different meanings — history could not tell them apart.`,
      (distinctMovements.length > 1 ? distinctMovements : distinctNames).join(" / ")
    );
  });

  // --- reuse: an existing ID now pointing at something else ------------------
  after.forEach((entry, id) => {
    const was = before.get(id);
    if (!was) return;

    const inHistory = loggedIds.has(id);
    let changed = false;
    let certain = false;
    let detail = "";

    if (was.movement && entry.movement) {
      certain = true;
      changed = was.movement !== entry.movement;
      detail = `movement ${was.movement} → ${entry.movement}`;
    } else if (was.name && entry.name && was.name !== entry.name) {
      const similarity = nameSimilarity(was.name, entry.name);
      changed = similarity < SIMILARITY_BLOCK_THRESHOLD;
      detail = `"${was.name}" → "${entry.name}" (name similarity ${similarity.toFixed(2)}, no movement reference to compare)`;
      if (!changed) {
        say("info", "renamed", id, `"${id}" was renamed but looks like the same movement.`, detail);
        return;
      }
    }

    if (!changed) return;

    if (inHistory) {
      say(
        "block",
        "reuse-logged",
        id,
        `"${id}" already appears in logged history and now refers to a different movement. Past entries would be relabelled. Give the new movement a new ID.`,
        detail + (certain ? "" : " — judged by name, not a movement reference")
      );
    } else {
      say(
        "warn",
        "reuse-unlogged",
        id,
        `"${id}" now refers to a different movement. Nothing has been logged under it, so nothing breaks today — but reusing IDs is what makes history unreadable later.`,
        detail
      );
    }
  });

  // --- removal ---------------------------------------------------------------
  before.forEach((entry, id) => {
    if (after.has(id)) return;
    if (loggedIds.has(id)) {
      say(
        "warn",
        "removed-logged",
        id,
        `"${id}" is gone from the program but appears in logged history. The entries survive; they lose their name.`,
        entry.name || null
      );
    } else {
      say("info", "removed", id, `"${id}" removed. Never logged, so nothing is affected.`, entry.name || null);
    }
  });

  // --- additions and orphans -------------------------------------------------
  after.forEach((entry, id) => {
    if (!before.has(id)) say("info", "added", id, `"${id}" is new.`, entry.name || null);
  });

  loggedIds.forEach((id) => {
    if (!before.has(id) && !after.has(id)) {
      say("info", "orphan", id, `"${id}" appears in history but in neither version of the program.`, null);
    }
  });

  const blocking = findings.filter((f) => f.severity === "block");
  const warnings = findings.filter((f) => f.severity === "warn");

  return {
    ok: blocking.length === 0,
    blocking,
    findings,
    summary: {
      block: blocking.length,
      warn: warnings.length,
      info: findings.length - blocking.length - warnings.length,
      idsBefore: before.size,
      idsAfter: after.size,
      idsLogged: loggedIds.size,
    },
  };
}
