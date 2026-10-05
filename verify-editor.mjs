// Phase 3a + 3b verification — run with `node verify-editor.mjs`.
// Pure edit model (src/core/editor.js) against the real programs in ./fixtures,
// plus the proof that the editor cannot bypass the existing preflight().

import fs from "fs";
import assert from "assert";
import {
  startDraft, setBlockField, setExerciseField, listEditable,
  catalogue, takenExerciseIds, addExistingExercise, addNewExercise, removeExercise, moveExercise,
  addBlock, retireBlock, restoreBlock, setBlockCardio, setHrZones, standardHrZones, setCardioTypes,
  setScheduleCell, moveScheduleCell, setDayNote, copyWeek, weekFor, setOptionLabel, diffDefinitions,
  saveDraft, loadDraft, clearDraft, draftStatus,
  availableStandardSlots, addSlot, addStandardSlot, standardSlotSpec, slotCountsAsCardio, cardioSlots,
  useStandardCardioTypes, sportProblem, SPORT_CHOICES,
} from "./src/core/editor.js";
import { validate, STANDARD_SLOTS, KNOWN_SPORTS } from "./src/core/program-schema.js";
import { collectLoggedIds } from "./src/core/validate-program.js";
import { preflight } from "./src/core/publish.js";
import { resolveSchedule } from "./src/core/engine.js";

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
  assert.strictEqual(draftOf(ID.juha, "2026-09-28").baseId, "juha-2026-09-23");
  assert.strictEqual(draftOf(ID.juha, "2026-09-30").baseId, "juha-2026-09-29");
  assert.strictEqual(draftOf(ID.juha, "2026-10-01").baseId, "juha-2026-10");
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

/* ------------------------------- Phase 3c ---------------------------------- */

check("every 3c function leaves its input unchanged and returns a new object", () => {
  const snap = clone(ville);
  const outs = [
    setScheduleCell(ville, "A", "6", "run", null),
    setDayNote(ville, "A", "1", "hello"),
    copyWeek(ville, "A", "B"),
    setOptionLabel(ville, "strength", "a", "A (legs)"),
    addBlock(ville, "strength", "New", "N"),
    restoreBlock(retireBlock(ville, "strength", "nogym"), "strength", "nogym", "NG"),
  ];
  outs.forEach((o) => assert.notStrictEqual(o, ville));
  diffDefinitions(ville, outs[0]);
  assert.deepStrictEqual(ville, snap);
});

check("setScheduleCell: rejects retired block, unknown slot, bad dow/week; writes null explicitly", () => {
  const retired = retireBlock(ville, "run", "long");
  assert.throws(() => setScheduleCell(retired, "A", "0", "run", "long"));
  assert.throws(() => setScheduleCell(ville, "A", "0", "run", "nope"));
  assert.throws(() => setScheduleCell(ville, "A", "0", "swim", "easy"));
  assert.throws(() => setScheduleCell(ville, "A", "7", "run", "easy"));
  assert.throws(() => setScheduleCell(ville, "A", "x", "run", "easy"));
  assert.throws(() => setScheduleCell(ville, "C", "0", "run", "easy"));
  const cleared = setScheduleCell(ville, "A", "6", "run", null);
  assert.ok(Object.prototype.hasOwnProperty.call(cleared.schedule.A["6"], "run"));
  assert.strictEqual(cleared.schedule.A["6"].run, null);
  const set = setScheduleCell(ville, "B", "0", "run", "long");
  assert.strictEqual(set.schedule.B["0"].run, "long");
  assert.deepStrictEqual(set.schedule.A, ville.schedule.A);
  assert.strictEqual(set.schedule.B["0"].note, ville.schedule.B["0"].note); // note untouched
  // a retired block already in a cell can still be cleared
  const stale = retireBlock(ville, "run", "long");
  assert.strictEqual(setScheduleCell(stale, "A", "6", "run", null).schedule.A["6"].run, null);
});

check("setDayNote sets and removes", () => {
  const d = setDayNote(ville, "A", "1", "Rest well");
  assert.strictEqual(d.schedule.A["1"].note, "Rest well");
  assert.ok(!("note" in setDayNote(d, "A", "1", "").schedule.A["1"]));
  assert.ok(!("note" in setDayNote(ville, "A", "0", "  ").schedule.A["0"]));
  assert.throws(() => setDayNote(ville, "A", "9", "x"));
});

check("copyWeek makes B deep-equal A; later edits to A do not change B", () => {
  const edited = setScheduleCell(ville, "A", "1", "run", "easy");
  const c = copyWeek(edited, "A", "B");
  assert.deepStrictEqual(c.schedule.B, c.schedule.A);
  const later = setDayNote(c, "A", "2", "changed");
  assert.notDeepStrictEqual(later.schedule.B, later.schedule.A);
  assert.strictEqual(c.schedule.B["1"].run, "easy");
  assert.notStrictEqual(c.schedule.B, c.schedule.A);
  assert.throws(() => copyWeek(ville, "A", "A"));
});

check("weekFor agrees with the engine's resolveSchedule(...).weekType for 60 consecutive days", () => {
  const start = new Date(2026, 8, 20);
  for (let i = 0; i < 60; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
    assert.strictEqual(weekFor(ds), resolveSchedule(d, "auto", {}, ville).weekType, ds);
  }
  assert.throws(() => weekFor("garbage"));
});

check("setOptionLabel changes only that option; retired / empty throws", () => {
  const out = setOptionLabel(ville, "strength", "a", "A (legs)");
  const opt = (d) => d.slotOptions.strength.map((o) => o.label);
  assert.strictEqual(out.slotOptions.strength.find((o) => o.value === "a").label, "A (legs)");
  assert.deepStrictEqual(out.blocks, ville.blocks);
  assert.deepStrictEqual(out.slotOptions.run, ville.slotOptions.run);
  assert.strictEqual(opt(out).filter((l, i) => l !== opt(ville)[i]).length, 1);
  assert.throws(() => setOptionLabel(ville, "strength", "a", " "));
  assert.throws(() => setOptionLabel(retireBlock(ville, "strength", "nogym"), "strength", "nogym", "x"));
  assert.throws(() => setOptionLabel(ville, "strength", "zzz", "x"));
});

check("addBlock / restoreBlock take an optional short label (default = block label)", () => {
  assert.deepStrictEqual(addBlock(ville, "strength", "Long name", "Short").slotOptions.strength.at(-1), { label: "Short", value: "long-name" });
  assert.strictEqual(addBlock(ville, "strength", "Long name").slotOptions.strength.at(-1).label, "Long name");
  const r = retireBlock(ville, "strength", "nogym");
  assert.strictEqual(restoreBlock(r, "strength", "nogym").slotOptions.strength.at(-1).label, ville.blocks.strength.nogym.label);
  assert.strictEqual(restoreBlock(r, "strength", "nogym", "NG").slotOptions.strength.at(-1).label, "NG");
});

check("diffDefinitions(x, x) is empty for every fixture", () => {
  for (const r of rows) assert.deepStrictEqual(diffDefinitions(r.definition, clone(r.definition)), [], r.id);
});

check("diffDefinitions: one change of each kind lists exactly those changes, in order", () => {
  let d = ville;
  d = setScheduleCell(d, "A", "2", "run", "long");                                   // schedule cell
  d = setDayNote(d, "B", "0", "Rest");                                               // note
  d = addBlock(d, "run", "Tempo run", "Tempo");                                      // block added
  d = retireBlock(d, "strength", "nogym");                                           // retired
  d = addExistingExercise(d, "strength", "c", catalogue(rows, ID.ville).find((e) => e.id === "bss")); // exercise added
  d = removeExercise(d, "strength", "b", "dead-bug");                                // removed
  d = moveExercise(d, "strength", "a", "rdl-bb", -1);                                // moved
  d = setExerciseField(d, "strength", "a", "leg-press", "presc", "4×8");            // field changed
  d = setBlockCardio(d, "run", "long", { durationMin: 120 });                        // cardio target
  d = setHrZones(d, standardHrZones());                                              // zones
  d = setCardioTypes(d, [{ id: "swim", label: "Swim", sports: [] }]);                // types
  d = setOptionLabel(d, "strength", "a", "A (legs)");                                // picker label
  const lines = diffDefinitions(ville, d);
  const kinds = lines.map((l) => l.split(/[:·]/)[0].trim().replace(/ (A|B)$/, ""));
  assert.deepStrictEqual(lines, [
    "Schedule A · Tue: run easy → long",
    "Schedule B · Sun: note changed",
    "Block retired: strength/nogym",
    'Block added: run/tempo-run "Tempo run"',
    "Field changed in strength/a: " + ville.blocks.strength.a.exercises.find((e) => e.id === "leg-press").name + ' (leg-press) presc "' + ville.blocks.strength.a.exercises.find((e) => e.id === "leg-press").presc + '" → "4×8"',
    "Exercise moved in strength/a: Bulgarian split squat (bss)", // rdl-bb up one = bss down one; one line, not two
    "Exercise removed from strength/b: " + ville.blocks.strength.b.exercises.find((e) => e.id === "dead-bug").name + " (dead-bug)",
    "Exercise added to strength/c: Bulgarian split squat (bss)",
    "Cardio target run/long: duration — → 120 min",
    "Zones changed",
    "Cardio types changed",
    'Picker label strength/a: "' + ville.slotOptions.strength.find((o) => o.value === "a").label + '" → "A (legs)"',
  ], kinds.join(","));
});

check("a Ville draft moving run/long Saturday → Sunday in both weeks passes preflight; diff has exactly two schedule lines", () => {
  let d = ville;
  for (const w of ["A", "B"]) {
    d = setScheduleCell(d, w, "6", "run", null);
    d = setScheduleCell(d, w, "0", "run", "long");
  }
  const lines = diffDefinitions(ville, d);
  assert.deepStrictEqual(lines, ["Schedule A · run long: Sat → Sun", "Schedule B · run long: Sat → Sun"]);
  const r = pf(ID.ville, "Ville", d);
  assert.deepStrictEqual(r.blocking, []);
  assert.strictEqual(r.ok, true);
});

// ---- R2: moveScheduleCell ----
check("moveScheduleCell: move to an empty day clears the source and fills the target", () => {
  const out = moveScheduleCell(ville, "A", "6", "0", "run");
  assert.strictEqual(out.schedule.A["6"].run, null);
  assert.strictEqual(out.schedule.A["0"].run, "long");
  assert.deepStrictEqual(out.schedule.B, ville.schedule.B, "other week untouched");
  assert.strictEqual(ville.schedule.A["6"].run, "long", "input not mutated");
});
check("moveScheduleCell: an occupied target swaps", () => {
  const out = moveScheduleCell(ville, "A", "6", "2", "run"); // Sat long ↔ Tue easy
  assert.strictEqual(out.schedule.A["2"].run, "long");
  assert.strictEqual(out.schedule.A["6"].run, "easy");
  const lines = diffDefinitions(ville, out);
  assert.strictEqual(lines.length, 2);
  assert.ok(lines.includes("Schedule A · Tue: run easy → long"), lines.join("|"));
  assert.ok(lines.includes("Schedule A · Sat: run long → easy"), lines.join("|"));
});
check("moveScheduleCell: the same day is a no-op", () => {
  assert.deepStrictEqual(moveScheduleCell(ville, "A", "6", "6", "run"), ville);
  assert.deepStrictEqual(diffDefinitions(ville, moveScheduleCell(ville, "A", "6", "6", "run")), []);
});
check("moveScheduleCell: an empty source throws; bad week/day/slot throw", () => {
  assert.throws(() => moveScheduleCell(ville, "A", "0", "1", "run"), /Nothing to move/);
  assert.throws(() => moveScheduleCell(ville, "C", "6", "0", "run"));
  assert.throws(() => moveScheduleCell(ville, "A", "6", "9", "run"));
  assert.throws(() => moveScheduleCell(ville, "A", "6", "0", "swim"));
});
check("moveScheduleCell: a retired block already in the schedule can be moved; the library cannot place it", () => {
  const retired = retireBlock(ville, "run", "long");
  assert.throws(() => setScheduleCell(retired, "A", "0", "run", "long"));
  const out = moveScheduleCell(retired, "A", "6", "0", "run");
  assert.strictEqual(out.schedule.A["0"].run, "long");
  assert.strictEqual(out.schedule.A["6"].run, null);
  const swapped = moveScheduleCell(retired, "A", "2", "6", "run"); // live easy onto retired long's day: long goes to Tue
  assert.strictEqual(swapped.schedule.A["6"].run, "easy");
  assert.strictEqual(swapped.schedule.A["2"].run, "long");
});
check("moveScheduleCell: Ville Block 2 (long run Sat → Sun, both weeks) equals the setScheduleCell scenario, same diff, passes preflight", () => {
  let viaSet = ville, viaMove = ville;
  for (const w of ["A", "B"]) {
    viaSet = setScheduleCell(viaSet, w, "6", "run", null);
    viaSet = setScheduleCell(viaSet, w, "0", "run", "long");
    viaMove = moveScheduleCell(viaMove, w, "6", "0", "run");
  }
  assert.deepStrictEqual(viaMove, viaSet);
  const lines = diffDefinitions(ville, viaMove);
  assert.deepStrictEqual(lines, diffDefinitions(ville, viaSet));
  assert.deepStrictEqual(lines, ["Schedule A · run long: Sat → Sun", "Schedule B · run long: Sat → Sun"]);
  const r = pf(ID.ville, "Ville", viaMove);
  assert.deepStrictEqual(r.blocking, []);
  assert.strictEqual(r.ok, true);
});

check("draft storage: save → load round-trips; stale baseId detected; broken storage never throws", () => {
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const d = setDayNote(ville, "A", "1", "x");
  assert.strictEqual(loadDraft(store, ID.ville), null);
  assert.strictEqual(saveDraft(store, ID.ville, "ville-2026-09", d, "2026-09-29T10:00:00Z"), true);
  assert.ok("coachDraft_" + ID.ville in mem);
  const got = loadDraft(store, ID.ville);
  assert.deepStrictEqual(got, { baseId: "ville-2026-09", savedAt: "2026-09-29T10:00:00Z", draft: d });
  assert.strictEqual(draftStatus(got, "ville-2026-09"), "resume");
  assert.strictEqual(draftStatus(got, "ville-2026-11"), "stale");
  assert.strictEqual(loadDraft(store, ID.juha), null);
  assert.strictEqual(clearDraft(store, ID.ville), true);
  assert.strictEqual(loadDraft(store, ID.ville), null);
  mem["coachDraft_x"] = "{not json"; assert.strictEqual(loadDraft(store, "x"), null);
  const boom = () => { throw new Error("denied"); };
  const bad = { getItem: boom, setItem: boom, removeItem: boom };
  assert.strictEqual(saveDraft(bad, ID.ville, "b", d), false);
  assert.strictEqual(loadDraft(bad, ID.ville), null);
  assert.strictEqual(clearDraft(bad, ID.ville), false);
  assert.strictEqual(saveDraft(null, ID.ville, "b", d), false);
  assert.strictEqual(loadDraft(undefined, ID.ville), null);
  assert.ok(setDayNote(ville, "A", "1", "still works").schedule.A["1"].note);
});


/* ------------------------------- Phase 6 ----------------------------------- */
// Standard slots, custom slots and cardio types. Every result must pass the same
// validate() the client uses.

const CLIENTS = [["henna", ID.henna], ["joonatan", ID.joonatan], ["ville", ID.ville], ["juha", ID.juha]];
const baseOf = (pid) => draftOf(pid).draft;
const errs = (def) => validate(def).errors;

check("every fixture programme starts valid (so any error below is the edit's)", () => {
  for (const [n, pid] of CLIENTS) assert.deepStrictEqual(errs(baseOf(pid)), [], n);
});

check("availableStandardSlots lists the catalogue slots the programme lacks, in catalogue order", () => {
  const henna = baseOf(ID.henna);
  assert.deepStrictEqual(henna.slots, ["strength", "yoga"]);
  assert.deepStrictEqual(availableStandardSlots(henna).map((s) => s.id), ["run", "walk", "swim", "bike", "cardio"]);
  assert.deepStrictEqual(availableStandardSlots(baseOf(ID.juha)).map((s) => s.id), ["run", "walk", "swim", "bike"]);
});

check("adding each standard slot to each fixture programme validates with 0 errors", () => {
  for (const [n, pid] of CLIENTS) {
    for (const s of availableStandardSlots(baseOf(pid))) {
      const out = addStandardSlot(baseOf(pid), s.id);
      assert.deepStrictEqual(errs(out), [], `${n} + ${s.id}`);
      assert.deepStrictEqual(out.slots, [...baseOf(pid).slots, s.id]);
      assert.deepStrictEqual(out.slotMeta[s.id], { label: s.label, color: s.color });
      assert.deepStrictEqual(out.blocks[s.id], {});
      assert.deepStrictEqual(out.slotOptions[s.id], [{ label: "None", value: null }]);
    }
  }
});

check("adding all the missing standard slots at once validates, and nothing else in the programme changes", () => {
  for (const [n, pid] of CLIENTS) {
    const base = baseOf(pid);
    let out = base;
    for (const s of availableStandardSlots(base)) out = addStandardSlot(out, s.id);
    assert.deepStrictEqual(errs(out), [], n);
    assert.deepStrictEqual(out.slots.slice(0, base.slots.length), base.slots);
    for (const k of Object.keys(base)) {
      if (["slots", "slotMeta", "blocks", "slotOptions"].includes(k)) continue;
      assert.deepStrictEqual(out[k], base[k], `${n}.${k}`);
    }
    for (const sl of base.slots) {
      assert.deepStrictEqual(out.blocks[sl], base.blocks[sl], `${n} blocks.${sl}`);
      assert.deepStrictEqual(out.slotMeta[sl], base.slotMeta[sl]);
      assert.deepStrictEqual(out.slotOptions[sl], base.slotOptions[sl]);
    }
  }
});

check("a custom slot (client-specific, like Tennis) validates on every fixture programme", () => {
  for (const [n, pid] of CLIENTS) {
    const out = addSlot(baseOf(pid), { id: "padel", label: "Padel", color: "#8B7BD8" });
    assert.deepStrictEqual(errs(out), [], n);
    assert.ok(out.slots.includes("padel"));
  }
});

check("adding an existing slot id throws (standard, custom and client-specific alike)", () => {
  assert.throws(() => addStandardSlot(baseOf(ID.henna), "strength"), /already exists/);
  assert.throws(() => addStandardSlot(addStandardSlot(baseOf(ID.henna), "walk"), "walk"), /already exists/);
  assert.throws(() => addSlot(baseOf(ID.juha), { id: "tennis", label: "Tennis", color: "#6FCF97" }), /already exists/);
  assert.throws(() => addSlot(baseOf(ID.ville), { id: "run", label: "Run again", color: "#6FCF97" }), /already exists/);
});

check("addSlot rejects a bad id, an empty label and a non-hex colour; an unknown standard id throws", () => {
  const d = baseOf(ID.henna);
  for (const id of ["", "Walk", "1walk", "wa lk", "walk!", "x".repeat(33)]) assert.throws(() => addSlot(d, { id, label: "L", color: "#112233" }), /slot id/, JSON.stringify(id));
  assert.throws(() => addSlot(d, { id: "ok", label: "  ", color: "#112233" }), /label/);
  for (const color of ["red", "#123", "112233", "#12345g"]) assert.throws(() => addSlot(d, { id: "ok", label: "L", color }), /colour/, color);
  assert.throws(() => standardSlotSpec("tennis"), /not a standard slot/);
});

check("adding a slot never mutates its input", () => {
  const d = baseOf(ID.henna), snap = clone(d);
  addStandardSlot(d, "walk");
  assert.deepStrictEqual(d, snap);
});

check("a slot cannot be removed or renamed: the editor has no such operation, and slot ids survive every edit", () => {
  const src = fs.readFileSync("./src/core/editor.js", "utf8");
  assert.ok(!/export function (removeSlot|renameSlot|deleteSlot)/.test(src));
  const out = addStandardSlot(baseOf(ID.henna), "walk");
  for (const sl of baseOf(ID.henna).slots) assert.ok(out.slots.includes(sl));
});

check("Henna: add Walk, add a block, place it on Tue and Thu — the whole publish check passes", () => {
  let d = addStandardSlot(baseOf(ID.henna), "walk");
  d = addBlock(d, "walk", "Easy walk", "Easy");
  assert.deepStrictEqual(d.slotOptions.walk, [{ label: "None", value: null }, { label: "Easy", value: "easy-walk" }]);
  d = setScheduleCell(d, "A", "2", "walk", "easy-walk");
  d = setScheduleCell(d, "A", "4", "walk", "easy-walk");
  d = setScheduleCell(d, "B", "2", "walk", "easy-walk");
  d = setScheduleCell(d, "B", "4", "walk", "easy-walk");
  assert.deepStrictEqual(errs(d), []);
  const r = pf(ID.henna, "Henna", d);
  assert.deepStrictEqual(r.blocking, []);
  assert.strictEqual(r.ok, true);
  const hits = [2, 4].map((dow) => resolveSchedule(new Date(2026, 9, 6 + (dow - 2)), "auto", {}, d).slots.walk);
  assert.deepStrictEqual(hits, ["easy-walk", "easy-walk"]);
});

check("after a slot is added, its block takes a cardio target and a duration task (as for any cardio slot)", () => {
  let d = addBlock(addStandardSlot(baseOf(ID.henna), "walk"), "walk", "Easy walk");
  d = addNewExercise(d, "walk", "easy-walk", { name: "Walk time", type: "number", unit: "min" }, new Set());
  const id = d.blocks.walk["easy-walk"].exercises[0].id;
  d = setBlockCardio(d, "walk", "easy-walk", { durationMin: 30, durationTaskId: id });
  assert.deepStrictEqual(errs(d), []);
  assert.strictEqual(d.blocks.walk["easy-walk"].cardio.durationTaskId, id);
});

check("slotCountsAsCardio / cardioSlots: strength and yoga are out, every other slot is in", () => {
  assert.strictEqual(slotCountsAsCardio("strength"), false);
  assert.strictEqual(slotCountsAsCardio("yoga"), false);
  for (const sl of ["run", "walk", "swim", "bike", "cardio", "tennis", "padel"]) assert.strictEqual(slotCountsAsCardio(sl), true, sl);
  assert.deepStrictEqual(cardioSlots(baseOf(ID.juha)), ["cardio", "tennis"]);
  assert.deepStrictEqual(cardioSlots(baseOf(ID.henna)), []);
  assert.deepStrictEqual(STANDARD_SLOTS.filter((s) => !s.countsAsCardio).map((s) => s.id), ["strength", "yoga"]);
});

check("the editor's Cardio target panel and cardio-type Slot list follow slotCountsAsCardio (source)", () => {
  const ui = fs.readFileSync("./src/editor.jsx", "utf8");
  assert.ok(/slotCountsAsCardio\(slot\) && \(/.test(ui), "target panel gated on slotCountsAsCardio");
  assert.ok(!/slot [!=]== "strength"/.test(ui), "no hard-coded strength check left");
  assert.ok(/cardioSlots\(draft\)/.test(ui), "Slot dropdown lists cardio slots only");
});

check("Use standard cardio types: Run, Walk, Bike, Swim, Cardio; linked only to slots the programme has; validates", () => {
  const henna = useStandardCardioTypes(baseOf(ID.henna));
  assert.deepStrictEqual(henna.cardioTypes.map((t) => t.id), ["run", "walk", "swim", "bike", "cardio"]);
  assert.ok(henna.cardioTypes.every((t) => t.slot === undefined), "Henna has none of those slots: extras-only");
  assert.deepStrictEqual(errs(henna), []);
  assert.deepStrictEqual(henna.cardioTypes.find((t) => t.id === "walk").sports, ["walking", "hiking"]);

  const ville = useStandardCardioTypes(baseOf(ID.ville));
  const slotOf = Object.fromEntries(ville.cardioTypes.map((t) => [t.id, t.slot]));
  assert.deepStrictEqual(slotOf, { run: "run", walk: undefined, swim: undefined, bike: "bike", cardio: undefined });
  assert.deepStrictEqual(errs(ville), []);

  const withWalk = useStandardCardioTypes(addStandardSlot(baseOf(ID.henna), "walk"));
  assert.strictEqual(withWalk.cardioTypes.find((t) => t.id === "walk").slot, "walk");
  assert.deepStrictEqual(errs(withWalk), []);

  const all = baseOf(ID.juha);
  let full = all;
  for (const s of availableStandardSlots(all)) full = addStandardSlot(full, s.id);
  const linked = useStandardCardioTypes(full);
  assert.ok(linked.cardioTypes.every((t) => t.slot === t.id), "every type linked to its own slot");
  assert.deepStrictEqual(errs(linked), []);
  assert.deepStrictEqual(validate(linked).warnings.filter((w) => /watch-sport|more than one/.test(w)), []);
});

check("Use standard cardio types keeps the coach's existing types (by id) and never duplicates", () => {
  const mine = setCardioTypes(baseOf(ID.henna), [{ id: "run", label: "My run", sports: ["running", "hiking"] }]);
  const out = useStandardCardioTypes(mine);
  assert.strictEqual(out.cardioTypes.find((t) => t.id === "run").label, "My run");
  assert.deepStrictEqual(out.cardioTypes.map((t) => t.id), ["run", "walk", "swim", "bike", "cardio"]);
  assert.deepStrictEqual(useStandardCardioTypes(out).cardioTypes, out.cardioTypes);
});

check("Joonatan's live-style ['Assault bike'] and ['Bike'] produce warnings, not errors", () => {
  const d = setCardioTypes(baseOf(ID.joonatan), [
    { id: "assault-bike", label: "Assault bike", sports: ["Assault bike"] },
    { id: "bike", label: "Bike", sports: ["Bike"] },
  ]);
  const r = validate(d);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.warnings.filter((w) => /not a known watch-sport code/.test(w)).length, 2);
  assert.strictEqual(pf(ID.joonatan, "Joonatan", d).ok, true, "warnings do not block publishing");
});

check("a cardio type listing strengthTraining or yoga is an error, and publishing is blocked", () => {
  for (const sp of ["strengthTraining", "yoga"]) {
    const d = setCardioTypes(baseOf(ID.henna), [{ id: "gym", label: "Gym", sports: [sp] }]);
    assert.ok(errs(d).some((e) => e.includes(sp)), sp);
    assert.strictEqual(pf(ID.henna, "Henna", d).ok, false, sp);
  }
});

check("sportProblem / SPORT_CHOICES agree with the validator", () => {
  assert.strictEqual(sportProblem(""), null);
  assert.strictEqual(sportProblem("running"), null);
  assert.ok(sportProblem("Assault bike").warning && !sportProblem("Assault bike").error);
  assert.ok(sportProblem("yoga").error && sportProblem("strengthTraining").error);
  assert.ok(!SPORT_CHOICES.includes("yoga") && !SPORT_CHOICES.includes("strengthTraining"));
  for (const c of SPORT_CHOICES) {
    assert.ok(KNOWN_SPORTS.includes(c));
    const r = validate({ ...baseOf(ID.henna), cardioTypes: [{ id: "t", label: "T", sports: [c] }] });
    assert.deepStrictEqual(r.errors, [], c);
    assert.deepStrictEqual(r.warnings.filter((w) => /watch-sport/.test(w)), [], c);
  }
});

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
