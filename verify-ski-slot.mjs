// verify-ski-slot.mjs — the Ski standard slot (Step 10 Phase 1, B1–B3; D10, D10a).
// Run: node verify-ski-slot.mjs
//
// Ski is a standard slot whose catalogue entry carries a block template:
// XC-Classic, XC-Skate and Downhill, each logged like a run (distance,
// duration, average and max HR). All three count toward weekly cardio,
// Downhill included (D10a). Task ids are permanent, so the template refuses to
// land in a programme that already uses one of its ids.

import fs from "fs";
import assert from "assert";
import { startDraft, addStandardSlot, availableStandardSlots, useStandardCardioTypes, addExistingExercise } from "./src/core/editor.js";
import { validate, STANDARD_SLOTS, KNOWN_SPORTS, SKI_BLOCKS } from "./src/core/program-schema.js";
import { weeklyCardioMinutes, resultWritesFromWorkout, matchDay } from "./src/core/cardio.js";
import { resolveSchedule, buildSections, countableTasks, isTaskDone, dateKey } from "./src/core/engine.js";

let checks = 0, failures = 0;
function check(label, fn) {
  checks += 1;
  try { fn(); console.log("  ok   " + label); }
  catch (e) { failures += 1; console.log("  FAIL " + label + "\n       " + e.message); }
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const rows = JSON.parse(fs.readFileSync("./fixtures/programs.json", "utf8"));
const KEYS = ["xc-classic", "xc-skate", "downhill"];
const LABELS = ["XC-Classic", "XC-Skate", "Downhill"];
const SESSION = { "xc-classic": ["ski-classic", "Classic skiing"], "xc-skate": ["ski-skate", "Skate skiing"], downhill: ["ski-downhill", "Downhill skiing"] };
const ville = () => clone(startDraft(rows, rows.find((r) => r.id === "ville-2026-10").assigned_to, "2026-10-05").draft);

check("catalogue: Ski is the eighth slot, after cardio, with the agreed fields", () => {
  assert.deepStrictEqual(STANDARD_SLOTS.map((s) => s.id).slice(-2), ["cardio", "ski"]);
  const s = STANDARD_SLOTS.find((x) => x.id === "ski");
  assert.deepStrictEqual({ ...s, blocks: undefined }, { id: "ski", label: "Ski", color: "#B5DDF2", countsAsCardio: true, sports: ["crossCountrySkiing"], blocks: undefined });
  assert.strictEqual(s.blocks, SKI_BLOCKS);
  assert.deepStrictEqual(STANDARD_SLOTS.filter((x) => x.blocks).map((x) => x.id), ["ski"], "only Ski has a template");
});

check("KNOWN_SPORTS already holds crossCountrySkiing and nordicWalking (5.9.6), once each", () => {
  for (const sp of ["crossCountrySkiing", "nordicWalking"]) assert.strictEqual(KNOWN_SPORTS.filter((x) => x === sp).length, 1, sp);
});

check("template: three blocks shaped like Ville's run blocks, result ids shared, no targets, no sports", () => {
  assert.deepStrictEqual(Object.keys(SKI_BLOCKS), KEYS);
  KEYS.forEach((k, i) => {
    const b = SKI_BLOCKS[k];
    assert.strictEqual(b.label, LABELS[i]);
    assert.strictEqual(b.cat, "ski");
    assert.deepStrictEqual(b.exercises.map((e) => e.id), [SESSION[k][0], "ski-dist", "ski-dur", "ski-hr-avg", "ski-hr-max"]);
    assert.deepStrictEqual(b.exercises[0], { id: SESSION[k][0], name: SESSION[k][1], sets: null, presc: "" });
    assert.deepStrictEqual(b.exercises.slice(1).map((e) => [e.name, e.type, e.unit, e.presc]), [
      ["Distance", "number", "km", "From your watch"],
      ["Duration", "number", "h:mm:ss", "From your watch · h:mm:ss or mm:ss"],
      ["Average heart rate", "number", "bpm", "From your watch"],
      ["Max heart rate", "number", "bpm", "From your watch"],
    ]);
    assert.deepStrictEqual(b.cardio, { durationTaskId: "ski-dur", distanceTaskId: "ski-dist", hrAvgTaskId: "ski-hr-avg", hrMaxTaskId: "ski-hr-max" });
  });
});

check("addStandardSlot(def, \"ski\") on every fixture programme: 0 errors, 3 blocks, None + 3 options", () => {
  assert.strictEqual(rows.length, 11);
  for (const r of rows) {
    const out = addStandardSlot(clone(r.definition), "ski");
    assert.deepStrictEqual(validate(out).errors, [], r.id);
    assert.deepStrictEqual(out.slots, [...r.definition.slots, "ski"], r.id);
    assert.deepStrictEqual(out.slotMeta.ski, { label: "Ski", color: "#B5DDF2" }, r.id);
    assert.deepStrictEqual(Object.keys(out.blocks.ski), KEYS, r.id);
    assert.deepStrictEqual(out.blocks.ski, SKI_BLOCKS, r.id);
    assert.notStrictEqual(out.blocks.ski["xc-classic"], SKI_BLOCKS["xc-classic"], "a copy, not the catalogue object");
    assert.deepStrictEqual(out.slotOptions.ski, [{ label: "None", value: null }, ...KEYS.map((k, i) => ({ label: LABELS[i], value: k }))], r.id);
  }
});

check("addStandardSlot leaves the input and the catalogue untouched", () => {
  const before = JSON.stringify(SKI_BLOCKS);
  const d = ville();
  const snap = JSON.stringify(d);
  const out = addStandardSlot(d, "ski");
  out.blocks.ski.downhill.label = "changed";
  out.blocks.ski.downhill.exercises.push({ id: "x" });
  assert.strictEqual(JSON.stringify(d), snap);
  assert.strictEqual(JSON.stringify(SKI_BLOCKS), before);
});

check("a slot without a template is still added empty", () => {
  const out = addStandardSlot(ville(), "walk");
  assert.deepStrictEqual(out.blocks.walk, {});
  assert.deepStrictEqual(out.slotOptions.walk, [{ label: "None", value: null }]);
});

check("throws, naming the id, when a template task id already exists anywhere in the programme", () => {
  // in a block
  const inBlock = addExistingExercise(ville(), "run", "easy", { id: "ski-dur", name: "Duration", type: "number", unit: "h:mm:ss" });
  assert.throws(() => addStandardSlot(inBlock, "ski"), /ski-dur already exists/);
  // in a daily task
  const inDaily = ville();
  inDaily.daily.find((s) => s.key === "check").tasks.push({ id: "ski-classic", name: "Ski" });
  assert.throws(() => addStandardSlot(inDaily, "ski"), /ski-classic already exists/);
  // in mobility
  const inMob = ville();
  inMob.mobility = [...(inMob.mobility || []), { id: "ski-downhill", name: "x" }];
  assert.throws(() => addStandardSlot(inMob, "ski"), /ski-downhill already exists/);
});

check("Ski is no longer offered once added", () => {
  const out = addStandardSlot(ville(), "ski");
  assert.ok(!availableStandardSlots(out).some((s) => s.id === "ski"));
  assert.throws(() => addStandardSlot(out, "ski"), /already exists/);
});

// A Monday in Ville's 2026-10 version; the three blocks on Mon, Tue, Wed.
const MON = new Date(2026, 9, 5);
const dayN = (n) => { const d = new Date(MON); d.setDate(d.getDate() + n); return d; };

check("weeklyCardioMinutes counts a logged ski-dur on each of the three blocks (D10a: Downhill counts)", () => {
  const p = addStandardSlot(ville(), "ski");
  const base = weeklyCardioMinutes(MON, {}, {}, p);
  const overrides = {}, log = {};
  KEYS.forEach((k, i) => {
    const key = dateKey(dayN(i));
    overrides[key] = { ski: k };
    log[key] = { done: {}, numbers: { "ski-dur": [45, 62.5, 90][i] } };
  });
  assert.strictEqual(weeklyCardioMinutes(MON, log, overrides, p) - base, 45 + 62.5 + 90);
  // Downhill alone
  const one = { [dateKey(dayN(2))]: { ski: "downhill" } };
  assert.strictEqual(weeklyCardioMinutes(MON, { [dateKey(dayN(2))]: { numbers: { "ski-dur": 90 } } }, one, p) - weeklyCardioMinutes(MON, {}, one, p), 90);
});

check("resultWritesFromWorkout fills all four fields from a crossCountrySkiing workout, on every block", () => {
  const w = { sport: "crossCountrySkiing", vendor: "polar", vendor_session_id: "s1", day: "2026-10-05", duration_minutes: 47.25, distance_km: 11.8, hr_avg: 141.6, hr_max: 167.2 };
  for (const k of KEYS) {
    const r = resultWritesFromWorkout(SKI_BLOCKS[k], w, null);
    assert.deepStrictEqual(r.numbers, { "ski-dur": 47.25, "ski-dist": 11.8, "ski-hr-avg": 142, "ski-hr-max": 167 }, k);
    assert.strictEqual(r.sessionTaskId, SESSION[k][0], k);
  }
});

check("the session task is the one countable item; the four results are result fields", () => {
  const p = addStandardSlot(ville(), "ski");
  const ov = { [dateKey(MON)]: { ski: "xc-skate" } };
  const sec = buildSections(MON, { weekType: "auto", overrides: ov }, p).find((s) => s.key === "ski");
  assert.strictEqual(sec.cat, "ski");
  assert.deepStrictEqual(countableTasks([sec]).map((t) => t.id), ["ski-skate"]);
  const task = sec.tasks[0];
  assert.strictEqual(isTaskDone(task, { numbers: { "ski-dur": 50 } }), true, "a logged duration ticks the session");
});

check("\"Use standard cardio types\" adds a Ski type, linked to the slot when present; validates", () => {
  const without = useStandardCardioTypes(ville());
  const t1 = without.cardioTypes.find((t) => t.id === "ski");
  assert.deepStrictEqual(t1, { id: "ski", label: "Ski", sports: ["crossCountrySkiing"] });
  assert.deepStrictEqual(validate(without).errors, []);
  const withSki = useStandardCardioTypes(addStandardSlot(ville(), "ski"));
  const t2 = withSki.cardioTypes.find((t) => t.id === "ski");
  assert.deepStrictEqual(t2, { id: "ski", label: "Ski", sports: ["crossCountrySkiing"], slot: "ski" });
  assert.deepStrictEqual(validate(withSki).errors, []);
});

check("with the Ski type linked, a crossCountrySkiing session fills the planned Ski block (no block sports list)", () => {
  const p = useStandardCardioTypes(addStandardSlot(ville(), "ski"));
  const ov = { [dateKey(MON)]: { ski: "downhill" } };
  const info = resolveSchedule(MON, "auto", ov, p);
  const w = { vendor: "polar", vendor_session_id: "s2", source: null, sport: "crossCountrySkiing", day: dateKey(MON), started_at: "2026-10-05T09:00:00Z", duration_minutes: 60 };
  const m = matchDay(MON, info, [w], p, ov);
  assert.strictEqual(m.planned.ski && m.planned.ski.vendor_session_id, "s2");
  assert.deepStrictEqual(m.extras, []);
});

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
