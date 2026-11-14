// verify-auto-validator.mjs — the daily `auto` rules in program-schema.js
// (Step 10 Phase 1, C1). Run: node verify-auto-validator.mjs
//
// A daily task may carry `auto: { source: "steps", min: N }` and tick itself
// from the day's Oura steps. Each error the brief names must fire, a valid one
// must not, and no fixture programme may gain an error from the new rules.

import fs from "fs";
import assert from "assert";
import { validate } from "./src/core/program-schema.js";

let checks = 0, failures = 0;
function check(label, fn) {
  checks += 1;
  try { fn(); console.log("  ok   " + label); }
  catch (e) { failures += 1; console.log("  FAIL " + label + "\n       " + e.message); }
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const rows = JSON.parse(fs.readFileSync("./fixtures/programs.json", "utf8"));
const juha = clone(rows.find((r) => r.id === "juha-2026-10").definition);

/** Juha's programme with `patch` merged into his chk-walk task. */
const walk = (patch) => {
  const d = clone(juha);
  const t = d.daily.find((s) => s.key === "check").tasks.find((x) => x.id === "chk-walk");
  Object.assign(t, patch);
  return d;
};
const errs = (d) => validate(d).errors;
const autoErrs = (d) => errs(d).filter((e) => /auto/.test(e));

check("every fixture programme (11 versions) validates with 0 errors under the new rules", () => {
  assert.strictEqual(rows.length, 11);
  for (const r of rows) assert.deepStrictEqual(errs(r.definition), [], r.id);
});

check("a valid auto on a plain daily task: no error, no warning", () => {
  const r = validate(walk({ auto: { source: "steps", min: 10000 } }));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
});

check("error: source is not \"steps\"", () => {
  for (const source of ["sleep", "Steps", undefined, 5]) {
    const e = autoErrs(walk({ auto: { source, min: 10000 } }));
    assert.strictEqual(e.length, 1, JSON.stringify(source));
    assert.match(e[0], /daily\[\d+\]\.tasks\[\d+\] \(chk-walk\)\.auto\.source must be "steps"/);
  }
});

check("error: min is not an integer of at least 1", () => {
  for (const min of [0, -5, 7000.5, "10000", null, undefined, NaN, Infinity]) {
    const e = autoErrs(walk({ auto: { source: "steps", min } }));
    assert.strictEqual(e.length, 1, String(min));
    assert.match(e[0], /\.auto\.min must be an integer of at least 1/);
  }
  assert.deepStrictEqual(autoErrs(walk({ auto: { source: "steps", min: 1 } })), [], "1 is the smallest allowed");
});

check("error: auto that is not an object names both fields", () => {
  for (const auto of [true, "steps", 10000, null, []]) {
    assert.strictEqual(autoErrs(walk({ auto })).length, 2, JSON.stringify(auto));
  }
});

check("error: the task has a type (only plain check tasks can auto-tick)", () => {
  for (const type of ["number", "choice", "scale", "notes", "exercise"]) {
    const e = autoErrs(walk({ type, auto: { source: "steps", min: 10000 } }));
    assert.strictEqual(e.length, 1, type);
    assert.match(e[0], new RegExp(`type "${type}" — only a plain check task can tick itself`));
  }
});

check("error: auto on a block exercise (\"auto is only for daily tasks\")", () => {
  const d = clone(juha);
  const [slot, group] = Object.entries(d.blocks).find(([, g]) => Object.keys(g).length);
  const [key, blk] = Object.entries(group)[0];
  blk.exercises[0].auto = { source: "steps", min: 10000 };
  const e = autoErrs(d);
  assert.strictEqual(e.length, 1);
  assert.match(e[0], new RegExp(`blocks\\.${slot}\\.${key}\\.exercises\\[0\\] carries auto — auto is only for daily tasks`));
});

check("byDayType variants are checked too, and a valid one passes", () => {
  const d = clone(juha);
  const nut = d.daily.find((s) => s.byDayType);
  assert.ok(nut, "Juha has a byDayType section");
  nut.byDayType.training.tasks = [{ id: "t-steps", name: "Walk", auto: { source: "steps", min: 8000 } }];
  assert.deepStrictEqual(errs(d), []);
  nut.byDayType.rest.tasks = [{ id: "r-steps", name: "Walk", auto: { source: "oura", min: 0 } }];
  const e = autoErrs(d);
  assert.strictEqual(e.length, 2);
  assert.ok(e.every((m) => m.includes("byDayType.rest.tasks[0] (r-steps).auto")), e.join("; "));
});

check("adding a valid auto to the auto-ready task of every fixture programme stays error-free", () => {
  for (const r of rows) {
    const d = clone(r.definition);
    const plain = d.daily.flatMap((s) => s.tasks || []).filter((t) => t.type === undefined);
    const t = plain.find((x) => ["chk-walk", "steps", "chk-walk-pk1"].includes(x.id));
    assert.ok(t, `${r.id} has a steps/walk check task`);
    t.auto = { source: "steps", min: 7000 };
    assert.deepStrictEqual(errs(d), [], r.id);
  }
});

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
