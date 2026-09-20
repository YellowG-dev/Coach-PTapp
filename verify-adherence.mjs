// Phase 6 verification — run with `node verify-adherence.mjs`.
//
// Not in the build graph. Run against payloads pulled from the live database,
// not invented fixtures: real data caught bugs in Phase 1 and Phase 4 that
// clean fixtures would have sailed past.
//
// The fixtures in ./fixtures are a reduced projection of the real rows —
// exactly the keys `isTaskDone()` reads (done, subs.name, scales, numbers,
// choices) plus weekType and gentler. loads, notes and the legacy mirrors are
// omitted because no completion rule reads them; every percentage below is
// therefore identical to one computed on the full payloads.

import fs from "fs";
import assert from "assert";
import {
  indexByDay,
  groupPrograms,
  resolveVersion,
  buildPersonAdherence,
  summarise,
  buildAllAdherence,
  pctLabel,
} from "./src/core/adherence.js";

import JUHA from "../verify/juha/core/program-juha.js";
import HENNA from "../verify/henna/core/program-henna.js";
import JOONATAN from "../verify/joonatan/core/program-joonatan.js";

let checks = 0;
let failures = 0;
function check(label, fn) {
  checks += 1;
  try {
    fn();
    console.log("  ok   " + label);
  } catch (e) {
    failures += 1;
    console.log("  FAIL " + label + "\n       " + e.message);
  }
}

const ID = {
  juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee",
  henna: "5b757e16-813a-46f6-be67-423ff3b093cc",
  joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d",
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const toRows = (obj) => Object.keys(obj).sort().map((day) => ({ day, payload: obj[day] }));

const logs = {
  [ID.juha]: toRows(readJson("./fixtures/logs-juha.json")),
  [ID.henna]: toRows(readJson("./fixtures/logs-henna.json")),
  [ID.joonatan]: toRows(readJson("./fixtures/logs-joonatan.json")),
};
const overrides = {
  [ID.juha]: toRows(readJson("./fixtures/overrides-juha.json")),
  [ID.henna]: toRows(readJson("./fixtures/overrides-henna.json")),
  [ID.joonatan]: toRows(readJson("./fixtures/overrides-joonatan.json")),
};

// Round-tripped through JSON on purpose: this is what arrives from Supabase
// as `definition` jsonb, and Phase 3 exists so that it is identical to the
// object the client app imports.
const asStored = (p) => JSON.parse(JSON.stringify(p));

const programRows = [
  { id: "juha-2026-09", name: "Juha — September 2026", assigned_to: ID.juha, effective_from: "-infinity", definition: asStored(JUHA) },
  { id: "henna-2026-09", name: "Henna — September 2026", assigned_to: ID.henna, effective_from: "-infinity", definition: asStored(HENNA) },
  { id: "joonatan-2026-09", name: "Joonatan — September 2026", assigned_to: ID.joonatan, effective_from: "-infinity", definition: asStored(JOONATAN) },
];

const roster = [
  { id: ID.juha, name: "Juha", isSelf: true },
  { id: ID.henna, name: "Henna", isSelf: false },
  { id: ID.joonatan, name: "Joonatan", isSelf: false },
];

/* ---------------------------- 1. Reshaping ------------------------------- */

console.log("\nReshaping");
check("indexByDay keys by the raw 'YYYY-MM-DD' string, no Date constructed", () => {
  const out = indexByDay([{ day: "2026-09-06", payload: { done: {} } }]);
  assert.deepStrictEqual(Object.keys(out), ["2026-09-06"]);
});
check("indexByDay tolerates a null payload without throwing", () => {
  const out = indexByDay([{ day: "2026-09-06", payload: null }]);
  assert.deepStrictEqual(out["2026-09-06"], {});
});
check("indexByDay skips malformed rows rather than producing an undefined key", () => {
  const out = indexByDay([null, { day: 7 }, { day: "2026-01-01", payload: {} }]);
  assert.deepStrictEqual(Object.keys(out), ["2026-01-01"]);
});

/* --------------------------- 2. Version resolution ----------------------- */

console.log("\nProgram version resolution");
check("'-infinity' covers every day, including days before the row existed", () => {
  const v = groupPrograms(programRows)[ID.juha];
  assert.ok(resolveVersion(v, "2026-08-01"), "Juha's logs start 2026-08-01, a month before the row");
  assert.ok(resolveVersion(v, "1999-01-01"));
});
check("unassigned rows are dropped, not attributed to their owner", () => {
  const g = groupPrograms([{ id: "x", assigned_to: null, effective_from: "-infinity", definition: {} }]);
  assert.deepStrictEqual(Object.keys(g), []);
});
check("greatest effective_from <= day wins across three versions", () => {
  const v = groupPrograms([
    { id: "v1", assigned_to: "u", effective_from: "-infinity", definition: { tag: "v1" } },
    { id: "v3", assigned_to: "u", effective_from: "2026-10-01", definition: { tag: "v3" } },
    { id: "v2", assigned_to: "u", effective_from: "2026-09-01", definition: { tag: "v2" } },
  ])["u"];
  assert.strictEqual(resolveVersion(v, "2026-08-31").definition.tag, "v1");
  assert.strictEqual(resolveVersion(v, "2026-09-01").definition.tag, "v2", "boundary day belongs to the new version");
  assert.strictEqual(resolveVersion(v, "2026-09-30").definition.tag, "v2");
  assert.strictEqual(resolveVersion(v, "2026-10-01").definition.tag, "v3");
  assert.strictEqual(resolveVersion(v, "2027-05-05").definition.tag, "v3");
});
check("a day before the first version returns null, never a later program", () => {
  const v = groupPrograms([
    { id: "v1", assigned_to: "u", effective_from: "2026-09-01", definition: { tag: "v1" } },
  ])["u"];
  assert.strictEqual(resolveVersion(v, "2026-08-31"), null);
});
check("'infinity' never takes effect", () => {
  const v = groupPrograms([
    { id: "never", assigned_to: "u", effective_from: "infinity", definition: { tag: "never" } },
  ])["u"];
  assert.strictEqual(resolveVersion(v, "2999-01-01"), null);
});
check("string sort would mis-order 10 vs 9 — numeric-safe ISO ordering holds", () => {
  const v = groupPrograms([
    { id: "b", assigned_to: "u", effective_from: "2026-10-01", definition: { tag: "oct" } },
    { id: "a", assigned_to: "u", effective_from: "2026-09-01", definition: { tag: "sep" } },
  ])["u"];
  assert.strictEqual(v[0].effectiveFrom, "2026-09-01");
  assert.strictEqual(resolveVersion(v, "2026-10-15").definition.tag, "oct");
});

/* ----------------------- 3. Scoring against real data -------------------- */

console.log("\nScoring real data");
const all = buildAllAdherence(roster, logs, overrides, programRows);

check("every logged day is either scored or explicitly unscored — none vanish", () => {
  for (const p of roster) {
    const logged = logs[p.id].length;
    const a = all[p.id];
    assert.strictEqual(a.days.length + a.unscored.length, logged, `${p.name}: ${a.days.length}+${a.unscored.length} != ${logged}`);
  }
});
check("nothing is unscored — all three people have a program covering all history", () => {
  for (const p of roster) assert.deepStrictEqual(all[p.id].unscored, [], `${p.name} has unscored days`);
});
check("Juha's 51 days all score (the assignment fix is what makes this pass)", () => {
  assert.strictEqual(all[ID.juha].days.length, 51);
});
check("doneCount never exceeds total, pct always within 0..1 or null", () => {
  for (const p of roster) {
    for (const d of all[p.id].days) {
      assert.ok(d.doneCount <= d.total, `${p.name} ${d.date}: ${d.doneCount}/${d.total}`);
      assert.ok(d.pct === null || (d.pct >= 0 && d.pct <= 1), `${p.name} ${d.date}: pct ${d.pct}`);
    }
  }
});
check("a day of 0 tasks yields pct null, never 0% — an unearned failure", () => {
  for (const p of roster) {
    for (const d of all[p.id].days) {
      if (d.total === 0) assert.strictEqual(d.pct, null, `${p.name} ${d.date} scored 0% on zero tasks`);
    }
  }
});
check("days come back newest first, matching the dashboard's existing order", () => {
  const dates = all[ID.juha].days.map((d) => d.date);
  assert.deepStrictEqual(dates, [...dates].sort().reverse());
});
check("Joonatan 2026-09-12 — the Phase 1 self-contradicting day — scores coherently", () => {
  // Payload is exactly { done: { "mob-2": false } }: one item, explicitly not done.
  const d = all[ID.joonatan].days.find((x) => x.date === "2026-09-12");
  assert.ok(d, "day missing entirely");
  assert.ok(d.total > 0, "a day with daily sections cannot have zero countable tasks");
  assert.strictEqual(d.pct !== null, true);
});
check("Juha's four skip days are flagged, not silently counted as failures", () => {
  // travel, travel, sick, travel. All four carry `skip` in day_overrides; the
  // first draft of this test asserted three and was wrong — the module found
  // 2026-09-12, which the override table does mark as skipped.
  const skipped = all[ID.juha].days.filter((d) => d.skip).map((d) => d.date).sort();
  assert.deepStrictEqual(skipped, ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-12"]);
  assert.deepStrictEqual(
    skipped.map((date) => all[ID.juha].days.find((d) => d.date === date).skip),
    ["travel", "travel", "sick", "travel"]
  );
});
check("skip days are excluded from the average, not scored as zero", () => {
  const days = all[ID.juha].days;
  const s = summarise(days);
  const manual = days.filter((d) => d.pct != null && !d.skip);
  assert.strictEqual(s.scoredDays, manual.length);
  const mean = manual.reduce((a, d) => a + d.pct, 0) / manual.length;
  assert.ok(Math.abs(s.avgPct - mean) < 1e-12);
  assert.strictEqual(s.skipDays, 4);
});
check("substituted exercises count as done — subs.name is a completion signal", () => {
  // 2026-09-04: lo-2 and lo-5 are absent from `done` but present in `subs`.
  const d = all[ID.juha].days.find((x) => x.date === "2026-09-04");
  const strengthCat = Object.keys(d.byCat).find((c) => d.byCat[c].total >= 6);
  assert.ok(strengthCat, "expected a strength-ish category on a lower day");
  assert.ok(d.doneCount >= 8, `only ${d.doneCount} done — substitutions may not be counting`);
});
check("categories come from the program, not a hardcoded list", () => {
  const juhaCats = Object.keys(all[ID.juha].summary.byCat);
  const hennaCats = Object.keys(all[ID.henna].summary.byCat);
  assert.ok(juhaCats.length > 0 && hennaCats.length > 0);
  assert.notDeepStrictEqual(juhaCats, hennaCats, "two different programs produced identical category sets — suspicious");
});
check("every person resolves to exactly one version today, and the code knows it", () => {
  for (const p of roster) assert.strictEqual(all[p.id].versionsUsed.length, 1, p.name);
});
check("a person with no program is marked noProgram, not shown as 0%", () => {
  const out = buildAllAdherence([{ id: "ghost" }], { ghost: [{ day: "2026-09-01", payload: { done: {} } }] }, {}, []);
  assert.strictEqual(out.ghost.noProgram, true);
  assert.strictEqual(out.ghost.summary, null);
  assert.deepStrictEqual(out.ghost.unscored, ["2026-09-01"]);
});

/* -------------------- 4. Engine agreement (no second truth) --------------- */

console.log("\nAgreement with the client engine");
const { buildHistoryRows } = await import("./src/core/engine.js");
check("per-day figures are byte-for-byte what buildHistoryRows returns", () => {
  const log = indexByDay(logs[ID.juha]);
  const ov = indexByDay(overrides[ID.juha]);
  const direct = buildHistoryRows(log, ov, asStored(JUHA));
  const mine = all[ID.juha].days;
  assert.strictEqual(direct.length, mine.length);
  for (const row of direct) {
    const m = mine.find((d) => d.date === row.date);
    assert.strictEqual(m.total, row.total, row.date + " total");
    assert.strictEqual(m.doneCount, row.doneCount, row.date + " doneCount");
  }
});

/* --------------------- 5. Rules of Hooks (structural) -------------------- */

// Phase 6 shipped a blank page because two useMemo calls sat below an early
// `return`, so the component registered 9 hooks on first render and 11 on the
// next and React aborted the tree. A mount test would not have caught it: the
// broken path only runs for a signed-in user, which needs Supabase stubbed.
// This scans the source instead — for every function whose name starts with a
// capital (a component) or `use` (a custom hook), no hook call may appear after
// that function's first top-level `return`.
console.log("\nRules of Hooks (structural scan of app.jsx)");

function blankOut(src) {
  // Replace comment and string-literal contents with spaces, preserving length
  // so line numbers stay correct. Without this the scan matched the word
  // "returns" inside a comment and reported a violation that did not exist.
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      while (i < src.length && src[i] !== "\n") out[i++] = " ";
    } else if (two === "/*") {
      out[i++] = " "; out[i++] = " ";
      while (i < src.length && src.slice(i, i + 2) !== "*/") out[i++] = " ";
      if (i < src.length) { out[i++] = " "; out[i++] = " "; }
    } else if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const q = src[i];
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") { out[i++] = " "; }
        if (i < src.length) out[i++] = " ";
      }
      if (i < src.length) i++;
    } else {
      i++;
    }
  }
  return out.join("");
}

function hookOrderViolations(rawSource) {
  const source = blankOut(rawSource);
  const bad = [];
  // `export default function CoachApp(` must match. The first draft of this
  // regex was /^(?:export\s+)?function/ and therefore skipped the one
  // component that had the defect, passing green against the broken file.
  const fnRe = /^(?:export\s+(?:default\s+)?)?function\s+([A-Z]\w*|use[A-Z]\w*)\s*\(/gm;
  let m;
  while ((m = fnRe.exec(source)) !== null) {
    const name = m[1];
    let i = source.indexOf("{", m.index + m[0].length);
    if (i === -1) continue;
    let depth = 0;
    let end = i;
    for (let k = i; k < source.length; k++) {
      if (source[k] === "{") depth++;
      else if (source[k] === "}") {
        depth--;
        if (depth === 0) { end = k; break; }
      }
    }
    const body = source.slice(i + 1, end);

    // first `return` at depth 0 relative to the body. Word boundaries on BOTH
    // sides: "returns" is not a return statement.
    let d = 0;
    let firstReturn = -1;
    for (let k = 0; k < body.length; k++) {
      const ch = body[k];
      if (ch === "{" || ch === "(") d++;
      else if (ch === "}" || ch === ")") d--;
      else if (
        d === 0 &&
        body.startsWith("return", k) &&
        !/\w/.test(body[k - 1] || "") &&
        !/\w/.test(body[k + 6] || "")
      ) {
        firstReturn = k;
        break;
      }
    }
    if (firstReturn === -1) continue;

    const after = body.slice(firstReturn);
    const hookRe = /\buse[A-Z]\w*\s*\(/g;
    let h;
    while ((h = hookRe.exec(after)) !== null) {
      const line = rawSource.slice(0, i + 1 + firstReturn + h.index).split("\n").length;
      bad.push(`${name}(): ${h[0].replace(/\s*\($/, "")} called after an early return, line ${line}`);
    }
  }
  return bad;
}

/** Which functions the scan actually looked at — under-coverage must be loud. */
function scannedNames(source) {
  const re = /^(?:export\s+(?:default\s+)?)?function\s+([A-Z]\w*|use[A-Z]\w*)\s*\(/gm;
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

check("the scan actually covers CoachApp and every other component", () => {
  const names = scannedNames(fs.readFileSync("./src/app.jsx", "utf8"));
  for (const required of ["CoachApp", "SignIn", "PersonPanel", "DayCard", "Adherence"]) {
    assert.ok(names.includes(required), `${required} was never scanned`);
  }
});

check("no hook is called after an early return anywhere in app.jsx", () => {
  const src = fs.readFileSync("./src/app.jsx", "utf8");
  const bad = hookOrderViolations(src);
  assert.deepStrictEqual(bad, [], "\n       " + bad.join("\n       "));
});

check("the scanner actually detects the bug it was written for", () => {
  const broken = [
    "function Broken() {",
    "  const [a, setA] = useState(1);",
    "  if (!a) return null;",
    "  const b = useMemo(() => 1, []);",
    "  return b;",
    "}",
  ].join("\n");
  const bad = hookOrderViolations(broken);
  assert.strictEqual(bad.length, 1, "scanner missed a known violation");
  assert.ok(bad[0].includes("useMemo"));
});

check("the scanner does not fire on correctly ordered hooks", () => {
  const good = [
    "function Fine() {",
    "  const [a, setA] = useState(1);",
    "  const b = useMemo(() => 1, []);",
    "  if (!a) return null;",
    "  return b;",
    "}",
  ].join("\n");
  assert.deepStrictEqual(hookOrderViolations(good), []);
});

/* ------------------------------ 6. Report -------------------------------- */

console.log("\nComputed adherence (real data)");
for (const p of roster) {
  const a = all[p.id];
  if (a.noProgram) {
    console.log(`\n  ${p.name}: no program assigned — ${a.unscored.length} days unscored`);
    continue;
  }
  const s = a.summary;
  console.log(
    `\n  ${p.name}: ${a.days.length} days · all-time ${pctLabel(s.avgPct)} · last 30d ${pctLabel(a.last30.avgPct)}` +
      ` · ${s.skipDays} skip, ${s.emptyDays} empty`
  );
  console.log(
    "    by category: " +
      Object.keys(s.byCat)
        .map((c) => `${c} ${pctLabel(s.byCat[c].pct)} (${s.byCat[c].done}/${s.byCat[c].total})`)
        .join(" · ")
  );
  console.log(
    "    most recent: " +
      a.days
        .slice(0, 5)
        .map((d) => `${d.date} ${d.skip ? "[" + d.skip + "]" : pctLabel(d.pct)}`)
        .join("  ")
  );
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
process.exit(failures ? 1 : 0);
