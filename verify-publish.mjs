// Phase 7 verification — run with `node verify-publish.mjs`.
//
// Exercises the publish preflight against the real programs and real logged
// history in ./fixtures. `publishProgram()` itself is not called: it writes,
// and a test suite that inserts rows into the live programs table would be a
// worse idea than any bug it could catch. Its two error paths are covered by
// shape, not by execution.

import fs from "fs";
import assert from "assert";
import { parseProgram, checkStructure, nextProgramRowId, preflight } from "./src/core/publish.js";

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
const toRows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));

const programRows = readJson("./fixtures/programs.json");
const byId = Object.fromEntries(programRows.map((r) => [r.id, r]));
const juhaLogs = toRows(readJson("./fixtures/logs-juha.json"));
const hennaLogs = toRows(readJson("./fixtures/logs-henna.json"));
const JUHA = byId["juha-2026-09"].definition;
const clone = (o) => JSON.parse(JSON.stringify(o));
const TODAY = new Date(2026, 8, 20); // 20 Sep 2026, so results do not drift

const base = {
  person: { id: ID.juha, name: "Juha" },
  effectiveFrom: "2026-11-01",
  existingRows: programRows,
  logRows: juhaLogs,
  ownerId: ID.juha,
  today: TODAY,
};

/* -------------------------------- Parsing -------------------------------- */

console.log("\nParsing the paste");
check("a pasted JS module is named as such, not reported as bad JSON", () => {
  const r = parseProgram('export const PROGRAM = { id: "juha" };');
  assert.strictEqual(r.ok, false);
  assert.ok(/JavaScript program file/.test(r.error), r.error);
});
check("malformed JSON gives the parser's own reason", () => {
  const r = parseProgram("{ nope");
  assert.strictEqual(r.ok, false);
  assert.ok(/Not valid JSON/.test(r.error));
});
check("an empty paste is not an error message about syntax", () => {
  assert.ok(/Nothing pasted/.test(parseProgram("   ").error));
});
check("a top-level array is rejected", () => {
  assert.strictEqual(parseProgram("[1,2]").ok, false);
});
check("a whole database row unwraps to its definition", () => {
  const r = parseProgram(JSON.stringify(byId["juha-2026-09"]));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.wasWrapped, true);
  assert.strictEqual(r.definition.id, "juha");
});
check("a bare definition is taken as-is", () => {
  const r = parseProgram(JSON.stringify(JUHA));
  assert.strictEqual(r.wasWrapped, false);
  assert.strictEqual(r.definition.id, "juha");
});

/* ------------------------------- Structure -------------------------------- */

console.log("\nStructure");
check("all three live programs pass the structural check", () => {
  for (const r of programRows) {
    const s = checkStructure(r.definition);
    assert.ok(s.ok, `${r.id}: ${s.problems.join("; ")}`);
  }
});
check("a slot with no matching block is caught", () => {
  const d = clone(JUHA);
  d.slots.push("swimming");
  const s = checkStructure(d);
  assert.strictEqual(s.ok, false);
  assert.ok(s.problems.some((p) => /swimming/.test(p)), s.problems.join("; "));
});
check("a missing schedule is caught", () => {
  const d = clone(JUHA);
  delete d.schedule;
  assert.strictEqual(checkStructure(d).ok, false);
});
check("an anchor in the wrong date format is caught — Phase 3's rule", () => {
  const d = clone(JUHA);
  d.deloadWave.anchor = "07/09/2026";
  const s = checkStructure(d);
  assert.strictEqual(s.ok, false);
  assert.ok(s.problems.some((p) => /anchor/.test(p)), s.problems.join("; "));
});

/* ------------------------------- Row identity ----------------------------- */

console.log("\nRow id minting");
check("first version in a month takes the family-YYYY-MM form", () => {
  assert.strictEqual(nextProgramRowId({ id: "juha" }, "2026-11-01", []), "juha-2026-11");
});
check("a second version in the same month does not collide", () => {
  const taken = ["juha-2026-11"];
  assert.strictEqual(nextProgramRowId({ id: "juha" }, "2026-11-14", taken), "juha-2026-11-14");
});
check("a third on the same day still does not collide", () => {
  const taken = ["juha-2026-11", "juha-2026-11-14"];
  assert.strictEqual(nextProgramRowId({ id: "juha" }, "2026-11-14", taken), "juha-2026-11-14-2");
});
check("the id minted never duplicates one already in the table", () => {
  const ids = programRows.map((r) => r.id);
  const minted = nextProgramRowId(JUHA, "2026-09-05", ids);
  assert.ok(!ids.includes(minted), minted + " collides with an existing row");
});

/* -------------------------------- Preflight ------------------------------- */

console.log("\nPreflight against real data");

check("republishing the current program unchanged, at a future date, passes", () => {
  const r = preflight({ ...base, text: JSON.stringify(JUHA) });
  assert.ok(r.ok, "blocked: " + r.blocking.join(" | "));
  assert.strictEqual(r.row.assigned_to, ID.juha);
  assert.strictEqual(r.row.owner_id, ID.juha);
  assert.strictEqual(r.row.effective_from, "2026-11-01");
});

check("the same effective date as an existing version is blocked, by name", () => {
  // Every live row is '-infinity'; use Henna, whose only row is that.
  const r = preflight({
    ...base,
    person: { id: ID.henna, name: "Henna" },
    logRows: hennaLogs,
    text: JSON.stringify(byId["henna-2026-09"].definition),
    effectiveFrom: "-infinity",
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((b) => /must be a real date/.test(b)), r.blocking.join(" | "));
});

check("a date earlier than the version in force is blocked as forward-only", () => {
  const rows = programRows.map((r) =>
    r.id === "juha-2026-09" ? { ...r, effective_from: "2026-09-06" } : r
  );
  const r = preflight({ ...base, existingRows: rows, text: JSON.stringify(JUHA), effectiveFrom: "2026-08-01" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((b) => /forward-only/.test(b)), r.blocking.join(" | "));
});

check("an exact duplicate date is blocked with a readable reason, not a 23505", () => {
  const rows = programRows.map((r) =>
    r.id === "juha-2026-09" ? { ...r, effective_from: "2026-09-06" } : r
  );
  const r = preflight({ ...base, existingRows: rows, text: JSON.stringify(JUHA), effectiveFrom: "2026-09-06" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((b) => /same day/.test(b)), r.blocking.join(" | "));
});

check("reusing a logged ID for a different movement BLOCKS", () => {
  const d = clone(JUHA);
  // up-1 is logged on many of Juha's days. Point it at something unrelated.
  let touched = 0;
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.id === "up-1" && typeof n.name === "string") {
      n.name = "Standing calf raise";
      touched += 1;
    }
    Object.keys(n).forEach((k) => walk(n[k]));
  };
  walk(d);
  assert.ok(touched > 0, "test could not find up-1 to rename");
  const r = preflight({ ...base, text: JSON.stringify(d) });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((b) => /up-1/.test(b)), r.blocking.join(" | "));
});

check("a cosmetic rename of a logged ID does not block", () => {
  const d = clone(JUHA);
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.id === "up-1" && typeof n.name === "string") n.name = n.name + " (dumbbell)";
    Object.keys(n).forEach((k) => walk(n[k]));
  };
  walk(d);
  const r = preflight({ ...base, text: JSON.stringify(d) });
  assert.ok(r.ok, "blocked: " + r.blocking.join(" | "));
});

check("backdating over logged days warns with a count, and does not block", () => {
  const r = preflight({ ...base, text: JSON.stringify(JUHA), effectiveFrom: "2026-09-01" });
  assert.ok(r.ok, "should warn, not block: " + r.blocking.join(" | "));
  const w = r.warnings.find((x) => /re-scored/.test(x));
  assert.ok(w, r.warnings.join(" | "));
  // 2026-09-01 .. 2026-09-20 inclusive in the fixture
  const expected = juhaLogs.filter((x) => x.day >= "2026-09-01").length;
  assert.ok(w.includes(String(expected)), `expected ${expected} in "${w}"`);
});

check("a past date is flagged even when nothing was logged after it", () => {
  const r = preflight({ ...base, text: JSON.stringify(JUHA), effectiveFrom: "2026-09-19", logRows: [] });
  assert.ok(r.warnings.some((x) => /in the past/.test(x)), r.warnings.join(" | "));
});

check("every return path carries the same keys, so `row` is null and never undefined", () => {
  const shapes = [
    preflight({ ...base, text: "{ broken" }),                 // parse failure
    preflight({ ...base, ownerId: null, text: "{}" }),        // not signed in
    preflight({ ...base, person: null, text: "{}" }),         // no client
    preflight({ ...base, text: JSON.stringify({ id: "x" }) }) // structural failure
  ];
  for (const r of shapes) {
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.row, null, "row must be null, not " + String(r.row));
    for (const k of ["ok", "blocking", "warnings", "validation", "inForce", "row"]) {
      assert.ok(k in r, "missing key " + k);
    }
  }
});

check("not signed in blocks before any parsing happens", () => {
  const r = preflight({ ...base, ownerId: null, text: "{ broken" });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.blocking, ["Not signed in."]);
});

check("publishing for Henna uses Henna's history, not Juha's", () => {
  // juha's `up-1` is not in Henna's logs, so reusing it there must not block.
  const d = clone(byId["henna-2026-09"].definition);
  const r = preflight({
    ...base,
    person: { id: ID.henna, name: "Henna" },
    logRows: hennaLogs,
    text: JSON.stringify(d),
  });
  assert.ok(r.ok, "blocked: " + r.blocking.join(" | "));
  assert.strictEqual(r.row.assigned_to, ID.henna);
  assert.strictEqual(r.validation.summary.idsLogged, 7, "should see only Henna's 7 logged ids");
});

check("the version in force is reported so the coach can see what is being replaced", () => {
  const r = preflight({ ...base, text: JSON.stringify(JUHA) });
  assert.strictEqual(r.inForce.id, "juha-2026-09");
});

console.log(`\n${checks - failures}/${checks} checks passed.`);
process.exit(failures ? 1 : 0);
