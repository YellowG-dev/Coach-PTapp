// Turning IDs into names.
//
// Until Phase 5 the dashboard could only show `up-1`, because the coach app
// had no copy of anyone's program. It now loads `programs`, so the names are
// available — but they come from three different places, and a resolver that
// only knew about one of them would leave a plausible-looking gap:
//
//   1. exercises inside blocks, and tasks inside daily/testing sections,
//      which carry `name`;
//   2. tracked metrics under `tracking`, which carry `label` rather than
//      `name` — this is why `chk-alc-units` resolved to nothing on the first
//      attempt while every exercise around it resolved fine;
//   3. ad-hoc activities, whose names are not in the program at all. They
//      live in `day_overrides[day].activities[]` and are logged under the key
//      `act-<activity id>`.
//
// Anything still unresolved keeps its raw ID. That is deliberate: an ID on
// screen is a visible prompt that something is missing from the program,
// whereas a blank or a guessed name hides it.

/**
 * { id: name } for one program definition.
 *
 * Walks the whole structure rather than known paths, for the same reason
 * `collectProgramIds` does: programs are plain data in several shapes, and a
 * resolver that only looked where it expected to would miss exactly the entry
 * nobody checked.
 */
export function namesFromProgram(definition) {
  const out = {};
  const seen = new Set();

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node.id === "string") {
      const label = typeof node.name === "string" ? node.name : typeof node.label === "string" ? node.label : null;
      if (label && !out[node.id]) out[node.id] = label;
    }
    Object.keys(node).forEach((k) => walk(node[k]));
  };

  walk(definition);
  return out;
}

/** { 'act-<id>': name } for every ad-hoc activity this person ever added. */
export function namesFromOverrides(overrideRows) {
  const out = {};
  (overrideRows || []).forEach((r) => {
    const list = r && r.payload && Array.isArray(r.payload.activities) ? r.payload.activities : [];
    list.forEach((a) => {
      if (a && a.id != null && typeof a.name === "string") out["act-" + a.id] = a.name;
    });
  });
  return out;
}

/**
 * One lookup for a person, merged across every program version they have.
 *
 * Merging across versions is safe because of a rule the platform already
 * enforces: exercise IDs are permanent and movement-specific, and reusing an
 * ID for a different movement is prohibited. So `up-1` cannot mean one thing
 * in September and another in November, and a single flat map cannot produce
 * a wrong name — only a missing one. Were that rule ever relaxed, this would
 * have to become per-version, keyed off each day's `programRowId`.
 *
 * Earlier versions win on conflict only in the sense that the first non-empty
 * name is kept; versions are passed newest-last so a renamed exercise shows
 * its older name rather than flickering. If that ever matters, reverse the
 * iteration — but under the ID rule above it cannot change which movement is
 * being described.
 */
export function buildNameMap(versions, overrideRows) {
  const out = {};
  (versions || []).forEach((v) => {
    const names = namesFromProgram(v.definition);
    Object.keys(names).forEach((id) => {
      if (!out[id]) out[id] = names[id];
    });
  });
  Object.assign(out, namesFromOverrides(overrideRows));
  return out;
}
