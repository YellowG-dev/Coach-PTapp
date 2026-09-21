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
// A legacy-only day: the old loose scalars with no modern counterpart.
const LEGACY = { weight: 84.2, knee: "mild", vo2max: 38, deload: true, weekType: "a", notes: "felt heavy", mystery: { foo: 1 } };

// Real rows, pulled from Supabase and trimmed of done/loads/subs/exNotes.
// Both shapes are present at once, which is true of all 27 pre-2026-08-28
// days. JUHA_0803 is one of the eight carrying `cardioHR`.
const JUHA_0803 = {
  knee: "none", deload: false, weight: 85.4, gentler: false, weekType: "A",
  scales: { "chk-knee": 1 },
  cardioHR: { avg: 116, peak: 139 },
  nutrition: { cal: 2950, fat: 90, carbs: 290, protein: 220 },
  numbers: {
    "nut-cal": 2950, "nut-fat": 90, "nut-pro": 220, "nut-carb": 290,
    "chk-weigh": 85.4, "cv-hr-avg": 116, "cv-hr-peak": 139,
  },
};
const JUHA_0815 = {
  knee: "none", deload: false, weight: 85.8, vo2max: 39, gentler: false, weekType: "B",
  scales: { "chk-knee": 1 },
  nutrition: { cal: 2570, fat: 95, carbs: 240, protein: 175 },
  numbers: {
    "nut-cal": 2570, "nut-fat": 95, "nut-pro": 175, "nut-carb": 240,
    "chk-weigh": 85.8, "cv-hr-avg": 113, "cv-hr-peak": 132, "test-vo2max": 39,
  },
};

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
check("daily checks identified by prefix", j.checks, ["chk-walk", "chk-water"]);
check("no bare exercise IDs left ticked here (all six had sets or subs)", j.ticked, []);
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
check("Henna: six opaque IDs ticked, none are daily checks", [h.ticked.length, h.checks.length], [6, 0]);
check("Henna: energy rating", h.ratings.find((r) => r.id === "energy").value, 2);
check("Henna: day not treated as empty", h.isEmpty, false);
const j12 = shapeDay(JOONATAN_0912);
check("unticked item separated from ticked", j12.unchecked, ["mob-2"]);
check("a day of only false flags is not 'empty'", j12.isEmpty, false);
check("truly empty payload is empty", shapeDay({}).isEmpty, true);

// Legacy fields are folded onto the IDs their modern counterparts use, so a
// value recorded under the old shape resolves to a real program label
// instead of a bare key. With no counterpart present, the value must still
// appear — under the new ID.
const L = shapeDay(LEGACY);
check("legacy weight folded onto chk-weigh", L.measurements.find((m) => m.id === "chk-weigh")?.value ?? null, 84.2);
check("legacy vo2max folded onto test-vo2max", L.measurements.find((m) => m.id === "test-vo2max")?.value ?? null, 38);
check("legacy knee folded onto chk-knee, still words", L.ratings.find((r) => r.id === "chk-knee")?.value ?? null, "mild");
check("no bare legacy IDs left behind", L.measurements.concat(L.ratings).filter((x) => ["weight", "knee", "vo2max", "cardioHR"].includes(x.id)), []);
check("legacy deload maps to gentler", L.gentler, true);
check("unrecognised key preserved, not dropped", L.unknown, { mystery: { foo: 1 } });
check("folded legacy keys are not re-reported as unknown", Object.keys(L.unknown || {}).sort(), ["mystery"]);

// The duplication this fold exists to remove. Before it, these days emitted
// each measurement twice — once from `numbers`, once from the loose scalar.
const D3 = shapeDay(JUHA_0803);
const idsOf = (list) => list.map((x) => x.id).sort();
const dupes = (list) => idsOf(list).filter((id, i, all) => all[i - 1] === id);
check("0803: no duplicate measurement IDs", dupes(D3.measurements), []);
check("0803: no duplicate rating IDs", dupes(D3.ratings), []);
check("0803: measurements are exactly the modern metrics", idsOf(D3.measurements), ["chk-weigh", "cv-hr-avg", "cv-hr-peak", "nut-cal", "nut-carb", "nut-fat", "nut-pro"]);
check("0803: no nut-protein / nut-carbs invented", idsOf(D3.measurements).filter((id) => id === "nut-protein" || id === "nut-carbs"), []);
check("0803: cardioHR consumed, not dumped as raw", D3.unknown, null); // null = nothing unrecognised
check("0803: knee shown once, from the scale", D3.ratings, [{ id: "chk-knee", value: 1 }]);

const D15 = shapeDay(JUHA_0815);
check("0815: no duplicate measurement IDs", dupes(D15.measurements), []);
check("0815: vo2max shown once", D15.measurements.filter((m) => String(m.id).includes("vo2max")).length, 1);
check("0815: nothing left unrecognised", D15.unknown, null);

// Proving the suppression can fail: a legacy value that DISAGREES with its
// counterpart must not be hidden. It is left unconsumed and reappears under
// "Other recorded fields". Without this case, a reader that dropped legacy
// fields unconditionally would pass every check above.
const CONFLICT = { ...JUHA_0803, weight: 99.9, cardioHR: { avg: 116, peak: 199 } };
const C = shapeDay(CONFLICT);
check("conflicting legacy weight is surfaced, not hidden", C.unknown?.weight ?? null, 99.9);
check("conflicting legacy cardioHR is surfaced, not hidden", C.unknown?.cardioHR ?? null, { avg: 116, peak: 199 });
check("agreeing legacy fields stay consumed in the same payload", Object.keys(C.unknown || {}).sort(), ["cardioHR", "weight"]);

console.log("\n--- ticked-without-sets vs daily checks ---");
const JOONATAN_0908 = {
  done: { "fb-1": true, "fb-2": true, "fb-3": true, "fb-4": true, "fb-5": true, "fb-6": true, "chk-walk": true },
  loads: { "fb-3": [{ r: 10, w: 50 }, { r: 10, w: 50 }, { r: 10, w: 50 }] },
  gentler: false,
  numbers: { "chk-sleep": 8 },
};
const j8 = shapeDay(JOONATAN_0908);
check("fb-3 has sets, shown as an exercise", j8.exercises.map((e) => e.id), ["fb-3"]);
check("the other five exercises are NOT filed as daily checks", j8.ticked, ["fb-1", "fb-2", "fb-4", "fb-5", "fb-6"]);
check("only chk- items are daily checks", j8.checks, ["chk-walk"]);

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

// --- Step 4 Phase 4: every colour comes from THEME in config.jsx ---
// The client apps carried hardcoded colours copied from one client's palette
// into all three; this keeps the same thing from creeping into the coach app.
// Read as text so this suite still needs no node_modules.
{
  const { readFileSync } = await import("fs");
  const coachApp = readFileSync("./src/app.jsx", "utf8");
  const literals = coachApp.match(/"#[0-9A-Fa-f]{3,8}"|rgba\([0-9., ]*\)/g) || [];
  check("no colour literal in coach app.jsx — use THEME", [...new Set(literals)].sort(), []);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
