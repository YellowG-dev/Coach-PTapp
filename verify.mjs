// Verification harness — real payloads copied verbatim out of Supabase.
// Run: node verify.mjs
import { shapeDay, shapeOverride, formatSets, labelFor } from "./src/core/shape.js";

const JOONATAN_0901 = {
  done: { "lg-1": true, "lg-2": true, "lg-3": true, "lg-4": true, "lg-5": true, "lg-6": true, "chk-walk": true, "chk-water": true },
  subs: { "lg-3": { name: "Hack squat", reason: null }, "lg-6": { name: "Cable crunch", reason: "equipment" } },
  loads: {
    "lg-1": [{ r: 8, w: 70 }, { r: 8, w: 70 }, { r: null, w: null }, { r: null, w: null }],
    "lg-2": [{ r: 8, w: 70 }, { r: 8, w: 70 }, { r: 8, w: 70 }],
    "lg-4": [{ r: 8, w: 60 }, { r: 8, w: 60 }],
    "lg-5": [{ r: 12, w: 50 }, { r: 12, w: 50 }],
    "lg-3::hack-squat": [{ r: 10, w: 65 }, { r: 9, w: 70 }, { r: null, w: null }],
    "lg-6::cable-crunch": [{ r: 10, w: 45 }, { r: 9, w: 50 }],
    "lg-3::leg-extension": [{ r: null, w: 60 }, { r: null, w: 60 }],
  },
  exNotes: { "lg-5": "60kg next nime" },
  gentler: false,
  numbers: { "chk-sleep": 8, "chk-weigh": 59.5 },
};

const JUHA_0917 = {
  done: { "lo-2": true, "up-1": true, "up-6": true, "mob-1": true, "ab-wheel": true, "chk-water": true, "row-1arm-db": true },
  subs: { "up-8": { name: "Hanging knee raise", reason: null }, "calf-seated": { name: "Standing calf raise", reason: null } },
  loads: {
    "lo-2": [{ r: 10, w: 100 }, { r: 10, w: 100 }, { r: 10, w: 100 }],
    "up-1": [{ r: 8, w: 28 }, { r: 8, w: 28 }, { r: 7, w: 28 }],
    "ab-wheel": [{ r: 10, w: null }, { r: 10, w: null }, { r: 8, w: null }],
    "up-8::hanging-knee-raise": [{ r: 12, w: 0 }, { r: 10, w: 0 }, { r: 10, w: 0 }],
    "calf-seated::standing-calf-raise": [{ r: 15, w: 50 }, { r: 15, w: 50 }, { r: 15, w: 50 }],
  },
  scales: { "chk-knee": 2 },
  choices: { "chk-alcohol": "none" },
  gentler: false,
  numbers: { "nut-cal": 2400, "nut-fat": 90, "nut-pro": 160, "nut-carb": 240, "chk-weigh": 85.8, "chk-alc-units": 0 },
};

const HENNA_0908 = { done: { m1: true, m2: true, m3: true, m4: true, m5: true, m6: true }, scales: { energy: 2 }, gentler: false };
const JOONATAN_0912 = { done: { "mob-2": false }, gentler: false };
const LEGACY = { weight: 84.2, knee: "mild", vo2max: 38, deload: true, weekType: "a", notes: "felt heavy", mystery: { foo: 1 } };

const OVERRIDES = [
  ["Juha 09-19", { cardio: null, tennis: "social", strength: null }],
  ["Juha 09-15", { strength: null, activities: [{ id: "1789497573951", name: "HIIT training 3x3x3x1min. Total 60mins" }] }],
  ["Juha 09-12", { skip: "travel", strength: null }],
  ["Juha 09-09", { skip: "sick", cardio: "zone2" }],
  ["test flags", { "test:inbody": true, testVo2max: false }],
];

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got      ${a}\n        expected ${e}`}`);
}

console.log("--- Joonatan 2026-09-01: substitutions with their own load keys ---");
const j = shapeDay(JOONATAN_0901);
check("exercise count", j.exercises.length, 6);
const lg3 = j.exercises.find((e) => e.id === "lg-3");
check("lg-3 substitution name", lg3.sub.name, "Hack squat");
check("lg-3 has no base sets", formatSets(lg3.sets), "");
check("lg-3 variant count (two movements logged)", lg3.variants.length, 2);
check("lg-3 hack-squat sets", formatSets(lg3.variants.find((v) => v.slug === "hack-squat").sets), "65×10, 70×9");
check("lg-3 leg-extension weight-only sets", formatSets(lg3.variants.find((v) => v.slug === "leg-extension").sets), "60, 60");
const lg6 = j.exercises.find((e) => e.id === "lg-6");
check("lg-6 substitution reason", lg6.sub.reason, "equipment");
check("lg-1 drops empty trailing sets", formatSets(j.exercises.find((e) => e.id === "lg-1").sets), "70×8, 70×8");
check("lg-5 note carried", j.exercises.find((e) => e.id === "lg-5").note, "60kg next nime");
check("checklist items not mixed into exercises", j.checked, ["chk-walk", "chk-water"]);
check("weigh-in read from numbers", j.measurements.find((m) => m.id === "chk-weigh").value, 59.5);
check("nothing unrecognised", j.unknown, null);

console.log("\n--- Juha 2026-09-17: bodyweight sets, zero-weight sets, ad-hoc IDs ---");
const u = shapeDay(JUHA_0917);
check("ab-wheel reps-only renders", formatSets(u.exercises.find((e) => e.id === "ab-wheel").sets), "×10, ×10, ×8");
check("zero-weight sets kept, not treated as empty", formatSets(u.exercises.find((e) => e.id === "up-8").variants[0].sets), "0×12, 0×10, 0×10");
check("nutrition numbers surfaced", u.measurements.filter((m) => m.id.startsWith("nut-")).length, 4);
check("knee scale read", u.ratings.find((r) => r.id === "chk-knee").value, 2);
check("alcohol choice read", u.ratings.find((r) => r.id === "chk-alcohol").value, "none");
check("mob-1 not shown as exercise (no sets)", Boolean(u.exercises.find((e) => e.id === "mob-1")), false);

console.log("\n--- sparse and legacy rows ---");
const h = shapeDay(HENNA_0908);
check("Henna: six opaque IDs ticked", h.checked.length, 6);
check("Henna: energy rating", h.ratings.find((r) => r.id === "energy").value, 2);
check("Henna: day not treated as empty", h.isEmpty, false);
const j12 = shapeDay(JOONATAN_0912);
check("unticked item separated from ticked", j12.unchecked, ["mob-2"]);
check("a day of only false flags is not 'empty'", j12.isEmpty, false);
check("truly empty payload is empty", shapeDay({}).isEmpty, true);

const L = shapeDay(LEGACY);
check("legacy loose weight surfaced", L.measurements.find((m) => m.id === "weight").value, 84.2);
check("legacy string knee surfaced", L.ratings.find((r) => r.id === "knee").value, "mild");
check("legacy deload maps to gentler", L.gentler, true);
check("unrecognised key preserved, not dropped", L.unknown, { mystery: { foo: 1 } });

console.log("\n--- schedule overrides ---");
OVERRIDES.forEach(([name, payload]) => {
  const s = shapeOverride(payload);
  console.log(
    `      ${name}: slots=${s.slots.map((x) => `${x.slot}:${x.value === null ? "cleared" : x.value}`).join(" ")}` +
      `${s.skip ? ` skip=${s.skip}` : ""}${s.activities.length ? ` activities=${s.activities.length}` : ""}` +
      `${s.tests.length ? ` tests=${s.tests.map((t) => `${t.name}:${t.due}`).join(" ")}` : ""}`
  );
});
const sk = shapeOverride({ skip: "travel", strength: null });
check("skip reason captured", sk.skip, "travel");
check("cleared slot distinguished from set slot", sk.slots, [{ slot: "strength", value: null }]);
const tf = shapeOverride({ "test:inbody": true, testVo2max: false });
check("both test key spellings parsed", tf.tests.length, 2);
check("labels fall back to the raw ID", labelFor("lg-1"), "lg-1");
check("known label resolves", labelFor("chk-weigh"), "Weigh-in");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
