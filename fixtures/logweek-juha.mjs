// A Juha week with logged sets, for the Training log (verify-logweek.mjs and
// the browser check). The committed logs-juha.json carries no `loads`, so this
// adds Mon 28 Sep – Sun 4 Oct 2026 by hand. Every number is chosen so the
// totals can be worked out on paper; the expected values live in
// verify-logweek.mjs, not here.
//
// The week crosses three programme versions (23 Sep, 29 Sep, 1 Oct), which is
// the point: Mon is scored against the first, Tue/Wed the second, Thu–Sun the
// third.

const MOB = ["mob-1", "mob-6", "mob-9", "mob-10", "mob-11", "mob-5", "mob-2", "mob-3", "mob-4", "mob-8", "mob-7"];
const ticks = (n) => Object.fromEntries(MOB.slice(0, n).map((id) => [id, true]));
const sets = (n, r, w) => Array.from({ length: n }, () => ({ r, w }));
const nums = (cal, pro, weigh, alc) => ({ "nut-cal": cal, "nut-pro": pro, "nut-carb": 250, "nut-fat": 80, "chk-weigh": weigh, "chk-alc-units": alc });

export const logs = {
  // Mon 28 — tennis lesson. 7 of 11 mobility, 2,430 kcal.
  "2026-09-28": { done: ticks(7), numbers: nums(2430, 190, 86.2, 0), scales: { "chk-knee": 2 } },

  // Tue 29 — Session A (10 planned). 7 logged, up-5 ticked, calf-seated unticked, hang-knee untouched.
  // sets 4+4+3+3+3+3+3 = 23; volume 940+1600+2160+1500+1620+720+1080 = 9,620.
  "2026-09-29": {
    done: { ...ticks(8), "up-5": true, "calf-seated": false },
    loads: {
      "db-bench": [{ r: 10, w: 22 }, { r: 8, w: 30 }, { r: 8, w: 30 }, { r: 8, w: 30 }],
      "up-2": sets(4, 10, 40),
      "lo-1": sets(3, 12, 60),
      "lo-5": sets(3, 10, 50),
      "leg-ext": sets(3, 12, 45),
      "up-7": sets(3, 12, 20),
      "tri-pushdown": sets(3, 12, 30),
    },
    numbers: nums(2550, 180, 86.0, 0),
    scales: { "chk-knee": 1 },
    notes: "Felt strong today",
  },

  // Wed 30 — cardio hard. 3 of 11 mobility, 2,400 kcal (−300), 160 g protein.
  "2026-09-30": { done: ticks(3), numbers: nums(2400, 160, 86.4, 0), scales: { "chk-knee": 2 } },

  // Thu 1 Oct — Session B (11 planned). 9 logged, one by substitution (Cable curl for Ez-bar curl),
  // up-8 ticked without sets, ab-wheel untouched.
  // sets: 3 each over nine exercises = 27; volume 3 sets × (r × w) per exercise = see test.
  "2026-10-01": {
    done: { ...ticks(6), "up-8": true },
    loads: {
      "up-1": sets(3, 10, 50),
      "row-1arm-db": sets(3, 10, 30),
      "lo-2": sets(3, 8, 80),
      "leg-press-1leg": sets(3, 10, 100),
      "calf-seated": sets(3, 15, 40),
      "lo-5": sets(3, 10, 50),
      "leg-ext": sets(3, 12, 45),
      "up-6": sets(3, 12, 25),
      "curl-ezbar::cable-curl": sets(3, 12, 30),
    },
    subs: { "curl-ezbar": { name: "Cable curl", reason: "Bar was taken" } },
    numbers: nums(2400, 190, 86.4, 0),
    scales: { "chk-knee": 2 },
  },

  // Fri 2 — rest day. 11 of 11 mobility; 2,300 kcal vs the 2,350 rest target (−50); 2 units of alcohol.
  "2026-10-02": { done: ticks(11), numbers: nums(2300, 190, 86.2, 2), scales: { "chk-knee": 2 } },

  // Sat 3 — Session C (11 planned), Zone 2 cleared by an override. 8 logged, 2,970 kcal = target + 270 (exactly 10 %).
  "2026-10-03": {
    done: { ...ticks(4), "up-9": true },
    loads: {
      "db-bench": [{ r: 10, w: 24 }, { r: 8, w: 30 }, { r: 8, w: 30 }, { r: 8, w: 30 }],
      "row-cable": sets(4, 10, 55),
      "ohp-barbell": sets(3, 8, 18),
      "lo-3": sets(3, 10, 22),
      "calf-seated": sets(3, 15, 45),
      "curl-incline-db": sets(3, 10, 12),
      "press-closegrip-db": sets(3, 10, 20),
      "up-5": sets(3, 12, 10),
    },
    numbers: nums(2970, 200, 86.5, 0),
    scales: { "chk-knee": 2 },
  },

  // Sun 4 — travel day (override). Weigh-in only.
  "2026-10-04": { numbers: { "chk-weigh": 87.2 }, scales: { "chk-knee": 2 } },
};

export const overrides = {
  "2026-10-03": { cardio: null },
  "2026-10-04": { skip: "travel" },
};
