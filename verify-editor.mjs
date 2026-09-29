// Phase 3a verification — run with `node verify-editor.mjs`.
// Pure edit model (src/core/editor.js) against the real programs in ./fixtures,
// plus the proof that the editor cannot bypass the existing preflight().

import fs from "fs";
import assert from "assert";
import { startDraft, setBlockField, setExerciseField, listEditable } from "./src/core/editor.js";
import { preflight } from "./src/core/publish.js";

let checks = 0, failures = 0;
function check(label, fn) {
  checks += 1;
  try { fn(); console.log("  ok   " + label); }
  catch (e) { failures += 1; console.log("  FAIL " + label + "\n       " + e.message); }
}

const ID = {
  juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee",
  henna: "5b757e16-813a-46f6-be67-423ff3b093cc",
  joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d",
  ville: "2a545525-d9a4-450c-b90b-ce04d8f48abe",
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const toRows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const clone = (o) => JSON.parse(JSON.stringify(o));
const rows = readJson("./fixtures/programs.json");
const juhaLogs = toRows(readJson("./fixtures/logs-juha.json"));
const TODAY = new Date(2026, 8, 28); // 28 Sep 2026
const FUTURE = "2026-10-05";
const OWNER = "owner-1";

const draftOf = (pid, date = "2026-10-01") => startDraft(rows, pid, date);
const juha = draftOf(ID.juha).draft;

check("round trip: every fixture row → startDraft → deep-equal", () => {
  for (const r of rows) {
    const d = startDraft(rows, r.assigned_to, r.effective_from === "-infinity" ? "2026-01-01" : r.effective_from);
    assert.ok(d.draft, r.id);
    assert.strictEqual(d.baseId, r.id);
    assert.deepStrictEqual(d.draft, r.definition, r.id);
    assert.notStrictEqual(d.draft, r.definition);
  }
});

check("startDraft picks the version in force on the date", () => {
  assert.strictEqual(draftOf(ID.juha, "2026-09-10").baseId, "juha-2026-09");
  assert.strictEqual(draftOf(ID.juha, "2026-10-01").baseId, "juha-2026-09-23");
});

check("startDraft with no version in force returns null draft and a reason", () => {
  const a = startDraft(rows, "nobody", "2026-10-01");
  assert.strictEqual(a.draft, null);
  assert.ok(a.reason);
  const b = startDraft(rows.filter((r) => r.id === "ville-2026-09"), ID.ville, "2026-09-01"); // before it starts
  assert.strictEqual(b.draft, null);
  assert.ok(b.reason);
});

// slot/block/exercise used by the setter tests
const S = "strength", B = "a", EX = "db-bench";
const exOf = (def) => def.blocks[S][B].exercises.find((e) => e.id === EX);
const withoutEx = (def) => { const c = clone(def); c.blocks[S][B].exercises = c.blocks[S][B].exercises.filter((e) => e.id !== EX); return c; };
const withoutBlockKey = (def, k) => { const c = clone(def); delete c.blocks[S][B][k]; return c; };

check("each block setter changes exactly one field", () => {
  const cases = [["label", "New label"], ["subtitle", "New sub"], ["gentlerNote", "New note"], ["noGym", true]];
  for (const [f, v] of cases) {
    const out = setBlockField(juha, S, B, f, v);
    assert.strictEqual(out.blocks[S][B][f], v, f);
    assert.deepStrictEqual(withoutBlockKey(out, f), withoutBlockKey(juha, f), f);
  }
});

check("each exercise setter changes exactly one field", () => {
  const cases = [["name", "Renamed"], ["presc", "5×5"], ["sets", 5], ["detail", "d"], ["video", "https://v"],
    ["pattern", "push"], ["altName", "alt"], ["altVideo", "https://a"], ["pctMin", 55], ["pctMax", 85], ["unit", "kg"]];
  for (const [f, v] of cases) {
    const out = setExerciseField(juha, S, B, EX, f, v);
    assert.strictEqual(exOf(out)[f], v, f);
    const a = clone(exOf(out)); delete a[f];
    const b = clone(exOf(juha)); delete b[f];
    assert.deepStrictEqual(a, b, f);
    assert.deepStrictEqual(withoutEx(out), withoutEx(juha), f);
  }
});

check("numbers are coerced; non-positive / non-finite remove the field", () => {
  assert.strictEqual(exOf(setExerciseField(juha, S, B, EX, "sets", "4")).sets, 4);
  for (const bad of ["", "abc", 0, -2, Infinity, NaN, null]) {
    assert.ok(!("sets" in exOf(setExerciseField(juha, S, B, EX, "sets", bad))), String(bad));
  }
});

check("inputs are never mutated", () => {
  const snap = clone(juha), rowsSnap = clone(rows);
  setBlockField(juha, S, B, "label", "x");
  setBlockField(juha, S, B, "subtitle", "");
  setExerciseField(juha, S, B, EX, "presc", "y");
  listEditable(juha);
  startDraft(rows, ID.juha, "2026-10-01");
  assert.deepStrictEqual(juha, snap);
  assert.deepStrictEqual(rows, rowsSnap);
});

check("id / type edits throw", () => {
  assert.throws(() => setExerciseField(juha, S, B, EX, "id", "x"));
  assert.throws(() => setExerciseField(juha, S, B, EX, "type", "number"));
  assert.throws(() => setExerciseField(juha, S, B, EX, "movement", "x"));
  assert.throws(() => setBlockField(juha, S, B, "cat", "x"));
});

check("empty label throws; empty subtitle / gentlerNote removes the key", () => {
  assert.throws(() => setBlockField(juha, S, B, "label", ""));
  assert.throws(() => setBlockField(juha, S, B, "label", "   "));
  assert.ok(juha.blocks[S][B].subtitle);
  assert.ok(!("subtitle" in setBlockField(juha, S, B, "subtitle", "").blocks[S][B]));
  assert.ok(!("gentlerNote" in setBlockField(juha, S, B, "gentlerNote", "").blocks[S][B]));
});

check("unknown block / exercise throws", () => {
  assert.throws(() => setBlockField(juha, S, "zzz", "label", "x"));
  assert.throws(() => setExerciseField(juha, S, B, "nope", "presc", "x"));
});

check("listEditable: slot order, retired marked", () => {
  const t = listEditable(juha);
  assert.deepStrictEqual(t.map((s) => s.slot), juha.slots);
  const strength = t.find((s) => s.slot === "strength");
  const byKey = Object.fromEntries(strength.blocks.map((b) => [b.key, b]));
  assert.strictEqual(byKey.a.retired, false);
  assert.strictEqual(byKey.full.retired, true); // in blocks, not in slotOptions
  const v = listEditable(draftOf(ID.ville, "2026-10-01").draft);
  const run = Object.fromEntries(v.find((s) => s.slot === "run").blocks.map((b) => [b.key, b.retired]));
  assert.deepStrictEqual(run, { easy: false, long: false });
});

check("a draft with an edited presc passes preflight", () => {
  const out = setExerciseField(juha, S, B, EX, "presc", "4×8 · RPE 8");
  const r = preflight({
    person: { id: ID.juha, name: "Juha" }, text: JSON.stringify(out), effectiveFrom: FUTURE,
    existingRows: rows, logRows: juhaLogs, ownerId: OWNER, today: TODAY,
  });
  assert.deepStrictEqual(r.blocking, []);
  assert.strictEqual(r.ok, true);
});

check("renaming a logged ID to a different movement is blocked by preflight", () => {
  // lo-1 is Bulgarian split squat and appears in Juha's logs
  const out = setExerciseField(juha, "strength", "a", "lo-1", "name", "Leg press");
  const r = preflight({
    person: { id: ID.juha, name: "Juha" }, text: JSON.stringify(out), effectiveFrom: FUTURE,
    existingRows: rows, logRows: juhaLogs, ownerId: OWNER, today: TODAY,
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.length > 0);
  assert.strictEqual(r.row, null);
});

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
