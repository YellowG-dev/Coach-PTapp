// Publishing a program version — Phase 7.
//
// Paste-and-validate, not a visual editor. The coach pastes a program
// definition as JSON, picks the date it takes effect, and this module decides
// whether that is safe to insert. Nothing here writes until `publishProgram`
// is called, and `publishProgram` refuses anything that has not passed
// `preflight` in the same shape.
//
// The rule that governs everything below: **a new version is a new row.**
// Never an UPDATE of the row in force. The unique index
// `(assigned_to, effective_from) WHERE assigned_to IS NOT NULL` enforces one
// version per client per day at the database level; everything this module
// does is to give a readable answer before that index produces a raw 23505.
//
// What publishing does NOT do, and the UI says so plainly: it does not change
// what the client's app runs. The three client apps import their program from
// their own `src/core/program-*.js` at build time and never read the
// `programs` table. Publishing changes how the coach dashboard scores the
// days, and it is where in-app program delivery will eventually read from.
// Treating it as "the client now has a new plan" would be wrong today.

import { validateProgramEdit, collectLoggedIds } from "./validate-program.js";

// Deliberately no Supabase import. Everything here is a pure decision about a
// pasted string, so verify-publish.mjs runs with no node_modules installed,
// the same as the other suites. The INSERT lives in data.js, which is the one
// module allowed to touch the database.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------- Parsing --------------------------------- */

/**
 * Parse pasted text into a definition, with a readable reason when it fails.
 *
 * The client program files are ES modules (`export const PROGRAM = {...}`),
 * not JSON, so a paste straight out of one will not parse. That is the most
 * likely mistake by a distance, so it is detected by name rather than left as
 * "Unexpected token e".
 */
export function parseProgram(text) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return { ok: false, error: "Nothing pasted yet." };

  if (/^\s*(import|export)\s/m.test(raw)) {
    return {
      ok: false,
      error:
        "That looks like the JavaScript program file, not JSON. Paste the definition object itself — in Node: " +
        "`node -e \"import('./src/core/program-juha.js').then(m=>console.log(JSON.stringify(m.default)))\"`",
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: "Not valid JSON: " + e.message };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON object at the top level." };
  }

  // A row may have been exported wrapped in its database row. Accept both.
  const definition = parsed.definition && typeof parsed.definition === "object" ? parsed.definition : parsed;

  return { ok: true, definition, wasWrapped: definition !== parsed };
}

/**
 * The structural minimum `engine.js` needs before it will render a single day.
 *
 * Checked separately from the ID validator because the failure modes are
 * different in kind: a missing `slots` array is a paste that will crash the
 * dashboard, whereas a reused ID is a paste that will quietly mislabel
 * history. Both must block, but the coach should be told which one happened.
 */
export function checkStructure(definition) {
  const problems = [];
  const need = (cond, message) => {
    if (!cond) problems.push(message);
  };

  need(typeof definition.id === "string" && definition.id, "`id` is missing — the program family name, e.g. \"juha\".");
  need(Array.isArray(definition.slots) && definition.slots.length > 0, "`slots` must be a non-empty array.");
  need(definition.schedule && typeof definition.schedule === "object", "`schedule` is missing.");
  need(definition.blocks && typeof definition.blocks === "object", "`blocks` is missing.");

  if (definition.schedule && typeof definition.schedule === "object") {
    const weekTypes = Object.keys(definition.schedule);
    need(weekTypes.length > 0, "`schedule` has no week types — expected at least an \"A\".");
    weekTypes.forEach((wt) => {
      const week = definition.schedule[wt];
      need(week && typeof week === "object", `schedule.${wt} is not an object.`);
    });
  }

  if (Array.isArray(definition.slots) && definition.blocks) {
    definition.slots.forEach((slot) => {
      need(
        definition.blocks[slot] && typeof definition.blocks[slot] === "object",
        `slot "${slot}" is declared in \`slots\` but has no entry in \`blocks\`.`
      );
    });
  }

  // Closures and Date objects cannot survive the JSON round trip that got this
  // here, so their absence is guaranteed — but a Date serialised to a string
  // in the wrong format will not be revived by `toDate()`. Phase 3 settled the
  // format; this catches a regression to it.
  const anchors = [];
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    Object.keys(node).forEach((k) => {
      if (k === "anchor" && node[k] != null) anchors.push({ path: `${path}.${k}`, value: node[k] });
      walk(node[k], `${path}.${k}`);
    });
  };
  walk(definition, "");
  anchors.forEach((a) => {
    need(
      typeof a.value === "string" && ISO_DATE.test(a.value),
      `${a.path} must be an ISO date string like "2026-09-06", got ${JSON.stringify(a.value)}.`
    );
  });

  return { ok: problems.length === 0, problems };
}

/* ------------------------------ Row identity ------------------------------ */

/**
 * A unique `programs.id` for the new row.
 *
 * `id` is a text primary key with no default, so something has to mint it.
 * The existing rows follow `<family>-<YYYY>-<MM>`, which collides the moment
 * two versions are published in the same month — so the day is appended when
 * the month-level form is already taken, and a counter after that. The id is
 * a stable handle, not a sort key: ordering is `effective_from`.
 */
export function nextProgramRowId(definition, effectiveFrom, existingIds) {
  const taken = new Set(existingIds || []);
  const family = String(definition.id || "program").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const [y, m, d] = effectiveFrom.split("-");
  const candidates = [`${family}-${y}-${m}`, `${family}-${y}-${m}-${d}`];
  for (const c of candidates) if (!taken.has(c)) return c;
  let n = 2;
  while (taken.has(`${family}-${y}-${m}-${d}-${n}`)) n += 1;
  return `${family}-${y}-${m}-${d}-${n}`;
}

/* -------------------------------- Preflight ------------------------------- */

/**
 * Everything decided before a single row is written.
 *
 * Inputs mirror what the dashboard already has in memory:
 *   person         — { id, name } the version is for
 *   text           — the pasted definition
 *   effectiveFrom  — 'YYYY-MM-DD'
 *   existingRows   — every `programs` row the coach can see
 *   logRows        — that person's `day_logs` rows, for `collectLoggedIds`
 *   ownerId        — auth.uid(), which RLS requires `owner_id` to equal
 *   today          — injectable for testing
 */
export function preflight({ person, text, effectiveFrom, existingRows, logRows, ownerId, today }) {
  const now = today || new Date();
  const todayStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const blocking = [];
  const warnings = [];

  // Every return from here carries the same keys, `row` included. An early
  // return that simply omitted `row` handed callers `undefined` where the
  // happy path hands them `null`, and a caller checking `r.row === null`
  // before enabling a Publish button would have been wrong in exactly the
  // case that matters.
  const stop = (message) => ({
    ok: false,
    blocking: [message],
    warnings: [],
    validation: null,
    inForce: null,
    row: null,
  });

  if (!person || !person.id) return stop("No client selected.");
  if (!ownerId) return stop("Not signed in.");

  const parsed = parseProgram(text);
  if (!parsed.ok) return stop(parsed.error);

  const structure = checkStructure(parsed.definition);
  structure.problems.forEach((p) => blocking.push(p));

  // --- the date ------------------------------------------------------------
  if (!ISO_DATE.test(String(effectiveFrom || ""))) {
    blocking.push("Effective date must be a real date in YYYY-MM-DD form.");
  }

  const mine = (existingRows || [])
    .filter((r) => r.assigned_to === person.id)
    .slice()
    .sort((a, b) => (String(a.effective_from) < String(b.effective_from) ? -1 : 1));
  const inForce = mine.length ? mine[mine.length - 1] : null;

  if (ISO_DATE.test(String(effectiveFrom || ""))) {
    if (mine.some((r) => String(r.effective_from) === effectiveFrom)) {
      blocking.push(
        `${person.name} already has a version effective ${effectiveFrom}. Two versions cannot take effect on the same day — pick another date, or delete that row first.`
      );
    }
    if (inForce && String(inForce.effective_from) !== "-infinity" && effectiveFrom <= String(inForce.effective_from)) {
      blocking.push(
        `Programs are versioned forward-only. The version in force starts ${inForce.effective_from}; a new one must start after that.`
      );
    }

    // Retroactive rescoring. Not blocked — backdating a correction to a date
    // nobody has logged against yet is legitimate — but if logged days fall on
    // or after this date, their percentages will change the moment this is
    // published, and that must be a deliberate act rather than a surprise.
    const affected = (logRows || []).filter((r) => String(r.day) >= effectiveFrom).length;
    if (affected > 0) {
      warnings.push(
        `${affected} already-logged day${affected === 1 ? "" : "s"} fall on or after ${effectiveFrom} and will be re-scored against this program.`
      );
    }
    if (effectiveFrom < todayStr) {
      warnings.push(`${effectiveFrom} is in the past (today is ${todayStr}).`);
    }
  }

  // --- the IDs -------------------------------------------------------------
  const logged = collectLoggedIds((logRows || []).map((r) => r.payload));
  const validation = validateProgramEdit(inForce ? inForce.definition : {}, parsed.definition, logged);
  validation.blocking.forEach((f) => blocking.push(f.message));
  validation.findings.filter((f) => f.severity === "warn").forEach((f) => warnings.push(f.message));

  const rowId = ISO_DATE.test(String(effectiveFrom || ""))
    ? nextProgramRowId(parsed.definition, effectiveFrom, (existingRows || []).map((r) => r.id))
    : null;

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    validation,
    inForce: inForce ? { id: inForce.id, name: inForce.name, effective_from: inForce.effective_from } : null,
    row:
      blocking.length === 0
        ? {
            id: rowId,
            owner_id: ownerId,
            name: `${person.name} — effective ${effectiveFrom}`,
            assigned_to: person.id,
            effective_from: effectiveFrom,
            definition: parsed.definition,
          }
        : null,
  };
}
