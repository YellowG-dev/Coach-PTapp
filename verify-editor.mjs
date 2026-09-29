// Phase 3a + 3b verification — run with `node verify-editor.mjs`.
// Pure edit model (src/core/editor.js) against the real programs in ./fixtures,
// plus the proof that the editor cannot bypass the existing preflight().

import fs from "fs";
import assert from "assert";
import {
  startDraft, setBlockField, setExerciseField, listEditable,
  catalogue, takenExerciseIds, addExistingExercise, addNewExercise, removeExercise, moveExercise,
  addBlock, retireBlock, restoreBlock, setBlockCardio, setHrZones, standardHrZones, setCardioTypes,
} from "./src/core/editor.js";
import { collectLoggedIds } from "./src/core/validate-program.js";
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

/* ------------------------------- Phase 3b ---------------------------------- */

const logRowsOf = { [ID.juha]: juhaLogs };
for (const n of ["henna", "joonatan"]) logRowsOf[ID[n]] = toRows(readJson(`./fixtures/logs-${n}.json`));
logRowsOf[ID.ville] = [];
const taken = (pid) => takenExerciseIds(rows, pid, collectLoggedIds(logRowsOf[pid].map((r) => r.payload)));
const pf = (pid, name, def) => preflight({
  person: { id: pid, name }, text: JSON.stringify(def), effectiveFrom: FUTURE,
  existingRows: rows, logRows: logRowsOf[pid], ownerId: OWNER, today: TODAY,
});
const ville = draftOf(ID.ville).draft;

check("catalogue: one entry per id, latest version wins, covers every version", () => {
  const cat = catalogue(rows, ID.juha);
  const ids = cat.map((e) => e.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const r of rows.filter((x) => x.assigned_to === ID.juha)) {
    for (const g of Object.values(r.definition.blocks)) for (const b of Object.values(g)) for (const e of b.exercises) assert.ok(ids.includes(e.id), e.id);
  }
  const bss = catalogue(rows, ID.ville).find((e) => e.id === "bss");
  assert.strictEqual(bss.name, "Bulgarian split squat");
  // latest wins: fake a newer version that renames up-5
  const newer = clone(rows.find((r) => r.id === "juha-2026-09-23"));
  newer.id = "x"; newer.effective_from = "2026-12-01";
  newer.definition.blocks.strength.upper.exercises.find((e) => e.id === "up-5").name = "LATEST";
  assert.strictEqual(catalogue([...rows, newer], ID.juha).find((e) => e.id === "up-5").name, "LATEST");
  assert.ok(!catalogue(rows, "nobody").length);
});

check("every 3b function returns a new object and leaves its input unchanged", () => {
  const snap = clone(ville), cat = catalogue(rows, ID.ville);
  const t = taken(ID.ville);
  const outs = [
    addExistingExercise(ville, "strength", "c", cat.find((e) => e.id === "bss")),
    addNewExercise(ville, "strength", "a", { name: "Step-up" }, t),
    removeExercise(ville, "strength", "a", "bss"),
    moveExercise(ville, "strength", "a", "bss", 1),
    addBlock(ville, "strength", "D — Test"),
    retireBlock(ville, "strength", "nogym"),
    restoreBlock(retireBlock(ville, "strength", "nogym"), "strength", "nogym"),
    setBlockCardio(ville, "run", "easy", { durationMin: 40 }),
    setHrZones(ville, standardHrZones()),
    setCardioTypes(ville, [{ id: "swim", label: "Swim", sports: ["Swimming"] }]),
  ];
  outs.forEach((o) => assert.notStrictEqual(o, ville));
  assert.deepStrictEqual(ville, snap);
});

check("addExistingExercise keeps the original id; refuses a duplicate in the block", () => {
  const entry = catalogue(rows, ID.ville).find((e) => e.id === "bss");
  const out = addExistingExercise(ville, "strength", "c", entry);
  const added = out.blocks.strength.c.exercises.at(-1);
  assert.strictEqual(added.id, "bss");
  assert.deepStrictEqual(added, entry);
  assert.notStrictEqual(added, entry);
  assert.throws(() => addExistingExercise(out, "strength", "c", entry));
  const at0 = addExistingExercise(ville, "strength", "c", entry, 0);
  assert.strictEqual(at0.blocks.strength.c.exercises[0].id, "bss");
  assert.strictEqual(addExistingExercise(ville, "strength", "c", entry, 99).blocks.strength.c.exercises.at(-1).id, "bss");
});

check("addNewExercise never returns an id present in any version or any log", () => {
  for (const [pid, def] of [[ID.juha, juha], [ID.ville, ville]]) {
    const t = taken(pid);
    assert.ok(t.size > 10);
    const slot = Object.keys(def.blocks)[0], key = Object.keys(def.blocks[slot])[0];
    for (const id of t) {
      // a name whose slug is exactly an existing / logged id must be suffixed
      const made = addNewExercise(def, slot, key, { name: id }, t).blocks[slot][key].exercises.at(-1).id;
      assert.ok(!t.has(made), `${id} → ${made}`);
    }
  }
  const t = taken(ID.ville);
  const a = addNewExercise(ville, "strength", "a", { name: "Bss" }, t);                 // slug "bss" collides
  assert.strictEqual(a.blocks.strength.a.exercises.at(-1).id, "bss-2");
  assert.ok(!t.has("bss-2"));
  const b = addNewExercise(a, "strength", "a", { name: "BSS" }, t);                     // -2 is now in the draft
  assert.strictEqual(b.blocks.strength.a.exercises.at(-1).id, "bss-3");
  const withLogged = new Set([...t, "step-up"]);                                          // logged-only id
  assert.strictEqual(addNewExercise(ville, "strength", "a", { name: "Step up!" }, withLogged).blocks.strength.a.exercises.at(-1).id, "step-up-2");
  // a logged id from Juha's real logs
  const jt = taken(ID.juha);
  const loggedOnly = [...collectLoggedIds(juhaLogs.map((r) => r.payload))][0];
  assert.ok(jt.has(loggedOnly));
  assert.notStrictEqual(addNewExercise(juha, "strength", "a", { name: loggedOnly }, jt).blocks.strength.a.exercises.at(-1).id, loggedOnly);
});

check("addNewExercise: slug rules, types, required fields", () => {
  const t = new Set();
  const id = (name, extra) => addNewExercise(ville, "strength", "a", { name, ...extra }, t).blocks.strength.a.exercises.at(-1);
  assert.strictEqual(id("Romanian  Deadlift (BB)!").id, "romanian-deadlift-bb");
  assert.strictEqual(id("x".repeat(60)).id.length, 32);
  assert.deepStrictEqual(id("Distance", { type: "number", unit: "km" }), { id: "distance", name: "Distance", type: "number", unit: "km" });
  assert.ok(!("type" in id("Plain")));
  assert.throws(() => addNewExercise(ville, "strength", "a", { name: "  " }, t));
  assert.throws(() => addNewExercise(ville, "strength", "a", { name: "!!!" }, t));
  assert.throws(() => addNewExercise(ville, "strength", "a", { name: "X", type: "scale" }, t));
  assert.throws(() => addNewExercise(ville, "strength", "a", { name: "X", type: "number" }, t));
  assert.throws(() => addNewExercise(ville, "strength", "zzz", { name: "X" }, t));
});

check("add → remove round-trips to the original definition", () => {
  const cat = catalogue(rows, ID.ville);
  const t = taken(ID.ville);
  const a = addExistingExercise(ville, "strength", "c", cat.find((e) => e.id === "bss"));
  assert.deepStrictEqual(removeExercise(a, "strength", "c", "bss"), ville);
  const n = addNewExercise(ville, "strength", "c", { name: "Step-up", presc: "3×8" }, t);
  assert.deepStrictEqual(removeExercise(n, "strength", "c", "step-up"), ville);
  assert.throws(() => removeExercise(ville, "strength", "c", "nope"));
});

check("moveExercise moves by one and clamps at both ends", () => {
  const ids = (d) => d.blocks.strength.a.exercises.map((e) => e.id);
  const base = ids(ville);
  assert.deepStrictEqual(ids(moveExercise(ville, "strength", "a", base[0], -1)), base);
  assert.deepStrictEqual(ids(moveExercise(ville, "strength", "a", base.at(-1), 1)), base);
  const down = ids(moveExercise(ville, "strength", "a", base[0], 1));
  assert.deepStrictEqual(down.slice(0, 2), [base[1], base[0]]);
  assert.deepStrictEqual(ids(moveExercise(moveExercise(ville, "strength", "a", base[0], 1), "strength", "a", base[0], -1)), base);
  assert.throws(() => moveExercise(ville, "strength", "a", base[0], 2));
});

check("addBlock adds a block and a slotOptions entry; keys are unique; label required", () => {
  const out = addBlock(ville, "strength", "D — Test");
  assert.deepStrictEqual(out.blocks.strength["d-test"], { label: "D — Test", exercises: [] });
  assert.deepStrictEqual(out.slotOptions.strength.at(-1), { label: "D — Test", value: "d-test" });
  assert.strictEqual(out.slotOptions.strength.length, ville.slotOptions.strength.length + 1);
  const again = addBlock(out, "strength", "D test");
  assert.ok(again.blocks.strength["d-test-2"]);
  assert.ok(addBlock(ville, "strength", "A").blocks.strength["a-2"]); // "a" exists
  assert.throws(() => addBlock(ville, "strength", " "));
  assert.throws(() => addBlock(ville, "nope", "X"));
});

check("retireBlock removes only the slotOptions entry; restoreBlock reverses it", () => {
  const out = retireBlock(ville, "strength", "nogym");
  assert.deepStrictEqual(out.blocks, ville.blocks);
  assert.ok(!out.slotOptions.strength.some((o) => o.value === "nogym"));
  assert.strictEqual(out.slotOptions.strength.length, ville.slotOptions.strength.length - 1);
  assert.strictEqual(listEditable(out).find((s) => s.slot === "strength").blocks.find((b) => b.key === "nogym").retired, true);
  const back = restoreBlock(out, "strength", "nogym");
  assert.strictEqual(listEditable(back).find((s) => s.slot === "strength").blocks.find((b) => b.key === "nogym").retired, false);
  assert.throws(() => retireBlock(out, "strength", "nogym"));
  assert.throws(() => restoreBlock(ville, "strength", "nogym"));
});

check("retiring the last non-null option in a slot throws", () => {
  const yoga = ville.slotOptions.yoga.filter((o) => o.value !== null);
  assert.strictEqual(yoga.length, 1);
  assert.throws(() => retireBlock(ville, "yoga", "session"));
  let d = ville;
  d = retireBlock(d, "run", "long");
  assert.throws(() => retireBlock(d, "run", "easy"));
});

check("setBlockCardio merges; empty removes the field; empty object removes cardio", () => {
  let d = setBlockCardio(ville, "run", "easy", { durationMin: "45", distanceKm: 8, pace: "5:30", note: "n" });
  assert.deepStrictEqual(d.blocks.run.easy.cardio, { durationMin: 45, distanceKm: 8, pace: "5:30", note: "n" });
  d = setBlockCardio(d, "run", "easy", { note: "" });
  assert.deepStrictEqual(d.blocks.run.easy.cardio, { durationMin: 45, distanceKm: 8, pace: "5:30" });
  d = setBlockCardio(d, "run", "easy", { durationMin: 0, distanceKm: "abc", pace: null });
  assert.ok(!("cardio" in d.blocks.run.easy));
  assert.deepStrictEqual(d, ville);
  assert.throws(() => setBlockCardio(ville, "run", "easy", { bogus: 1 }));
  assert.throws(() => setBlockCardio(ville, "run", "zzz", { note: "x" }));
});

check("standardHrZones is PK1 60–70, PK2 70–80, VK 80–90; setHrZones / setCardioTypes set and clear", () => {
  const z = standardHrZones();
  assert.deepStrictEqual(z.map((x) => [x.id, x.pctMin, x.pctMax]), [["PK1", 60, 70], ["PK2", 70, 80], ["VK", 80, 90]]);
  const d = setHrZones(ville, z);
  assert.deepStrictEqual(d.hrZones, z);
  assert.ok(!("hrZones" in setHrZones(d, [])));
  const t = setCardioTypes(ville, [{ id: "swim", label: "Swim", sports: [" Swimming ", ""], slot: "run" }, { id: "x", label: "X" }]);
  assert.deepStrictEqual(t.cardioTypes, [{ id: "swim", label: "Swim", sports: ["Swimming"], slot: "run" }, { id: "x", label: "X", sports: [] }]);
  assert.ok(!("cardioTypes" in setCardioTypes(t, [])));
});

// The composite draft used by the preflight checks: new block + new exercise + zones + cardio target
const composite = (zone) => {
  let d = setHrZones(ville, standardHrZones());
  d = addBlock(d, "run", "Intervals");
  d = addNewExercise(d, "run", "intervals", { name: "Intervals", presc: "6×3 min" }, taken(ID.ville));
  d = addNewExercise(d, "run", "intervals", { name: "Duration", type: "number", unit: "min" }, taken(ID.ville));
  d = setBlockCardio(d, "run", "intervals", { durationMin: 40, zoneAvg: zone, zoneMax: "VK", pace: "4:45", durationTaskId: "duration" });
  return d;
};

check("a draft with a new block, new exercise, standard zones and zoneAvg PK1 passes preflight", () => {
  const r = pf(ID.ville, "Ville", composite("PK1"));
  assert.deepStrictEqual(r.blocking, []);
  assert.strictEqual(r.ok, true);
});

check("the same draft with zoneAvg PK9 is blocked by preflight", () => {
  const r = pf(ID.ville, "Ville", composite("PK9"));
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((m) => /PK9/.test(m)), r.blocking.join(" | "));
  assert.strictEqual(r.row, null);
});

check("Bulgarian split squat added to a new Ville block via Add existing keeps id bss and passes preflight", () => {
  let d = addBlock(ville, "strength", "D — Legs 2");
  d = addExistingExercise(d, "strength", "d-legs-2", catalogue(rows, ID.ville).find((e) => e.name === "Bulgarian split squat"));
  assert.strictEqual(d.blocks.strength["d-legs-2"].exercises[0].id, "bss");
  const r = pf(ID.ville, "Ville", d);
  assert.deepStrictEqual(r.blocking, []);
  assert.strictEqual(r.ok, true);
});

check("retiring a block and removing an exercise pass preflight (history kept)", () => {
  const d = removeExercise(retireBlock(juha, "strength", "a"), "strength", "upper", "up-5");
  const r = pf(ID.juha, "Juha", d);
  assert.deepStrictEqual(r.blocking, []);
});

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
