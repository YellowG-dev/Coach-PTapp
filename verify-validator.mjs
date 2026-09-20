// Tests for the exercise-ID permanence validator.
// Run: node verify-validator.mjs
//
// Self-contained on purpose. Unlike the one-off Phase 3 regression, this one
// keeps working after deployment: the fixtures are declared here rather than
// compared against a previous copy of the code.

import {
  validateProgramEdit,
  collectProgramIds,
  collectLoggedIds,
  nameSimilarity,
} from "./src/core/validate-program.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`}`);
}
const codes = (r) => r.findings.map((f) => `${f.severity}:${f.code}:${f.id}`).sort();
const has = (r, code, id) => r.findings.some((f) => f.code === code && f.id === id);

// A program shaped like the real ones: nested blocks, daily sections, testing.
const base = {
  blocks: {
    legs: { label: "Legs", exercises: [
      { id: "lg-1", name: "Back Squat", presc: "4×6–10" },
      { id: "lg-3", name: "Bulgarian Split Squat", presc: "3×10–12" },
    ] },
  },
  daily: [
    { key: "check", tasks: [
      { id: "chk-water", name: "Drink 3 L water" },
      { id: "chk-weigh", name: "Morning weigh-in", type: "number" },
    ] },
  ],
  testing: { items: [{ id: "inbody", label: "InBody", tasks: [{ id: "test-smm", name: "SMM" }] }] },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const history = ["lg-1", "lg-3", "chk-water", "chk-weigh"];

console.log("--- collection ---");
check("finds IDs at every depth", collectProgramIds(base).size, 6);
check("logged IDs strip substitution slugs", Array.from(collectLoggedIds([
  { done: { "lg-1": true }, loads: { "lg-3::hack-squat": [{ w: 60, r: 8 }] }, subs: { "lg-3": { name: "Hack squat" } } },
])).sort(), ["lg-1", "lg-3"]);
check("empty history is not an error", collectLoggedIds(null).size, 0);
check("malformed payloads are skipped", collectLoggedIds([null, 5, { done: null }]).size, 0);

console.log("\n--- the corruption case: reuse of a logged ID ---");
const reuse = clone(base);
reuse.blocks.legs.exercises[1].name = "Leg Press";
const rReuse = validateProgramEdit(base, reuse, history);
check("blocks", rReuse.ok, false);
check("names the offending ID", rReuse.blocking.map((f) => f.id), ["lg-3"]);
check("with the right code", rReuse.blocking[0].code, "reuse-logged");

console.log("\n--- same reuse, but nothing logged under that ID ---");
const rUnlogged = validateProgramEdit(base, reuse, ["lg-1"]);
check("does not block", rUnlogged.ok, true);
check("still warns", has(rUnlogged, "reuse-unlogged", "lg-3"), true);

console.log("\n--- editing a target is not reuse ---");
const retarget = clone(base);
retarget.daily[0].tasks[0].name = "Drink 2 L water";
const rRetarget = validateProgramEdit(base, retarget, history);
check("does not block", rRetarget.ok, true);
check("treated as a rename, not a warning", codes(rRetarget).filter((c) => !c.startsWith("info")), []);

console.log("\n--- a movement reference makes it exact ---");
const withMove = clone(base);
withMove.blocks.legs.exercises[0].movement = "back-squat";
const sameMoveRenamed = clone(withMove);
sameMoveRenamed.blocks.legs.exercises[0].name = "Barbell Back Squat (high bar)";
const rSame = validateProgramEdit(withMove, sameMoveRenamed, history);
check("renaming with the movement unchanged is fine", rSame.ok, true);
check("and not even a warning", rSame.summary.warn, 0);

const movedOn = clone(withMove);
movedOn.blocks.legs.exercises[0].movement = "leg-press";
movedOn.blocks.legs.exercises[0].name = "Back Squat"; // name deliberately unchanged
const rMoved = validateProgramEdit(withMove, movedOn, history);
check("a changed movement blocks even when the name is identical", rMoved.ok, false);
check("which name-matching alone would have missed", has(rMoved, "reuse-logged", "lg-1"), true);

console.log("\n--- removal ---");
const removed = clone(base);
removed.blocks.legs.exercises.pop(); // drops lg-3, which has history
const rRemoved = validateProgramEdit(base, removed, history);
check("does not block", rRemoved.ok, true);
check("warns that history loses its label", has(rRemoved, "removed-logged", "lg-3"), true);

const removedUnlogged = clone(base);
removedUnlogged.blocks.legs.exercises.pop();
const rRemovedClean = validateProgramEdit(base, removedUnlogged, ["lg-1"]);
check("removing an unlogged ID is info only", rRemovedClean.summary.warn, 0);

console.log("\n--- duplicate IDs in the proposed program ---");
const dupe = clone(base);
dupe.blocks.legs.exercises.push({ id: "lg-1", name: "Front Squat" });
const rDupe = validateProgramEdit(base, dupe, history);
check("two meanings under one ID blocks", rDupe.ok, false);
check("reports duplicate-id", has(rDupe, "duplicate-id", "lg-1"), true);

// The live programs do this legitimately 27 times: one exercise listed in two
// blocks, and nutrition tasks declared in both day-type variants.
const repeated = clone(base);
repeated.blocks.upper = { label: "Upper", exercises: [{ id: "lg-1", name: "Back Squat", presc: "4×6–10" }] };
const rRepeat = validateProgramEdit(base, repeated, history);
check("the same exercise in two blocks is fine", rRepeat.ok, true);
check("and raises nothing at all", rRepeat.findings.filter((f) => f.code === "duplicate-id").length, 0);

const repeatedDiff = clone(repeated);
repeatedDiff.blocks.upper.exercises[0].movement = "front-squat";
repeatedDiff.blocks.legs.exercises[0].movement = "back-squat";
check("but conflicting movement refs under one ID still block",
  validateProgramEdit(base, repeatedDiff, history).ok, false);

console.log("\n--- additions, orphans, and the no-op case ---");
const added = clone(base);
added.blocks.legs.exercises.push({ id: "lg-9", name: "Leg Extension" });
check("a new ID is info", validateProgramEdit(base, added, history).summary.block, 0);
check("history with no program entry is flagged as orphan",
  has(validateProgramEdit(base, base, [...history, "ghost-1"]), "orphan", "ghost-1"), true);
const rNoop = validateProgramEdit(base, clone(base), history);
check("an unchanged program produces nothing at all", rNoop.findings.length, 0);
check("and is ok", rNoop.ok, true);

console.log("\n--- similarity behaviour it depends on ---");
check("unrelated movements score low", nameSimilarity("Incline dumbbell press", "Front or goblet squat") < 0.5, true);
check("a reworded target scores high", nameSimilarity("Drink 3 L water", "Drink 2 L water") >= 0.5, true);
check("case and punctuation ignored", nameSimilarity("Cat–Cow → thoracic rotation", "cat cow thoracic rotation"), 1);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
