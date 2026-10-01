import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const ROOT = "/home/user/Ville-PTapp";
const OUT = "/home/user/Coach-PTapp/briefs/reports/step9-phase5-cardio-client";
const { PROGRAM } = await import(`${ROOT}/src/core/program-ville.js`);

const server = spawn("python3", ["-m", "http.server", "8765"], { cwd: ROOT, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const UID = "11111111-2222-3333-4444-555555555555";

// A delivered programme: run every day, with cardio target + duration task.
function fixtureProgram(withCardio, strengthDay = false) {
  const d = JSON.parse(JSON.stringify(PROGRAM));
  const week = {};
  for (let i = 0; i < 7; i++) week[i] = { strength: strengthDay ? "a" : null, run: "easy", bike: null, yoga: null };
  d.schedule = { A: week, B: week };
  delete d.startDate;
  if (withCardio) {
    d.hrZones = [
      { id: "z1", label: "Zone 1", pctMin: 50, pctMax: 60 },
      { id: "z2", label: "Zone 2", pctMin: 60, pctMax: 70 },
      { id: "z3", label: "Zone 3", pctMin: 70, pctMax: 80 },
    ];
    d.cardioTypes = [
      { id: "run", label: "Run", sports: ["running"], slot: "run" },
      { id: "bike", label: "Cycling", sports: ["cycling"] },
      { id: "swim", label: "Swim", sports: ["swimming"] },
    ];
    d.blocks.run.easy.exercises = [
      ...d.blocks.run.easy.exercises,
      { id: "run-dur", name: "Run time", presc: "log minutes", type: "number", unit: "min" },
    ];
    d.blocks.run.easy.cardio = { durationMin: 45, distanceKm: 7, zoneAvg: "z2", zoneMax: "z3", pace: "6:30", note: "Keep it conversational", durationTaskId: "run-dur" };
  }
  return d;
}

const wk = (id, sport, mins, extra = {}) => ({
  user_id: UID, vendor: "polar", vendor_session_id: id, day: TODAY, sport, source: null,
  started_at: `${TODAY}T0${sport === "running" ? 7 : 6}:00:00Z`, duration_minutes: mins,
  distance_km: sport === "running" ? 7.2 : null, hr_avg: 152, hr_max: 171, ...extra,
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp: 4102444800, role: "authenticated" })}.sig`;
const session = {
  access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
  user: { id: UID, aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

async function open(browser, { withCardio, workouts = [], overrides = {}, hrMax = 180, signedIn = true, strengthDay = false }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({ withCardio, prog, overrides, hrMax, session, signedIn, UID }) => {
    const P = "ptAppVille_";
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    if (signedIn) localStorage.setItem(P + "auth", JSON.stringify(session));
    if (withCardio) localStorage.setItem(P + "programsV2", JSON.stringify({ rows: [{ id: "p1", name: "Fixture", assigned_to: UID, effective_from: "-infinity", definition: prog }], fetchedAt: new Date().toISOString(), userId: UID }));
    localStorage.setItem(P + "overrides", JSON.stringify(overrides));
    localStorage.setItem(P + "settings", JSON.stringify({ gentler: false, hrMax }));
  }, { withCardio, prog: fixtureProgram(true, strengthDay), overrides, hrMax, session, signedIn, UID });
  await page.route("**/rest/v1/**", (route) => {
    const u = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.includes("/wearable_workouts")) return json(workouts);
    if (u.includes("/wearable_connections")) return json([{ user_id: UID, vendor: "polar", status: "active", connected_at: null, last_synced_at: null }]);
    if (u.includes("/programs")) return json(withCardio ? [{ id: "p1", name: "Fixture", assigned_to: UID, effective_from: "-infinity", definition: fixtureProgram(true, strengthDay) }] : []);
    return json([]);
  });
  await page.route("**/functions/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) }));
  await page.goto("http://localhost:8765/index.html");
  await page.waitForTimeout(4500);
  return { page, ctx, errors };
}
const ls = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem("ptAppVille_" + k) || "null"), key);
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const results = [];
const check = (name, fn) => { try { fn(); results.push(["ok", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message.split("\n")[0]]); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
try {
  /* 1. Today with a planned match + target + weekly line */
  {
    const { page, ctx, errors } = await open(browser, { withCardio: true, workouts: [wk("A1", "running", 42)] });
    let t = await text(page);
    check("planned: target line shows duration, distance, zones with bpm, pace, note", () => {
      assert.match(t, /Target: 45 min · 7 km · avg Zone 2 \(108–126 bpm\) · max Zone 3 \(126–144 bpm\) · 6:30 \/km/);
      assert.match(t, /Keep it conversational/);
    });
    check("planned: suggestion shown inside the run section, not as Recorded", () => {
      assert.match(t, /Recorded by your watch/i);
      assert.match(t, /Running|Run · 42 min · 7.2 km · avg 152 bpm/);
      assert.doesNotMatch(t, /Recorded, not planned/i);
    });
    check("weekly line shown with 0 min before any confirm", () => assert.match(t, /Cardio this week: 0 min/));
    check("nothing written before the client taps", async () => {});
    assert.equal((await ls(page, "log")) && (await ls(page, "log"))[TODAY]?.numbers?.["run-dur"], undefined);
    await shot(page, "1-today-planned-match");
    await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
    await page.waitForTimeout(500);
    const log = await ls(page, "log"), ov = await ls(page, "overrides");

    check("confirm planned: minutes written to run-dur", () => assert.equal(log[TODAY].numbers["run-dur"], 42));
    check("confirm planned: no activities[] entry", () => assert.equal(ov[TODAY]?.activities, undefined));
    check("confirm planned: key remembered in dismissedWorkouts", () => assert.deepEqual(ov[TODAY].dismissedWorkouts, ["polar:A1"]));
    t = await text(page);
    check("confirm planned: suggestion gone, weekly line 42 min", () => { assert.doesNotMatch(t, /Recorded by your watch/i); assert.match(t, /Cardio this week: 42 min/); });
    await page.reload(); await page.waitForTimeout(4500);
    t = await text(page);
    check("confirm planned: not re-offered after reload", () => assert.doesNotMatch(t, /Recorded by your watch/i));
    check("no page errors (planned)", () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  /* 2. Today with a recorded extra */
  {
    const { page, ctx, errors } = await open(browser, { withCardio: true, workouts: [wk("B1", "cycling", 60)] });
    let t = await text(page);
    check("extra: shown in Recorded group, marked not planned", () => { assert.match(t, /Recorded, not planned/i); assert.match(t, /Cycling · 1 h 00 min/); });
    await shot(page, "2-today-recorded-extra");
    await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
    await page.waitForTimeout(500);
    const ov = await ls(page, "overrides");
    check("confirm extra: one activity written with the Phase 2 shape", () => {
      const a = ov[TODAY].activities;
      assert.equal(a.length, 1);
      assert.equal(a[0].id, "polar:B1"); assert.equal(a[0].name, "Cycling"); assert.equal(a[0].typeId, "bike");
      assert.equal(a[0].durationMin, 60); assert.equal(a[0].source, "wearable");
    });
    t = await text(page);
    check("confirm extra: moves from Recorded to Extra Activity with its detail; weekly 60", () => {
      assert.doesNotMatch(t, /Recorded, not planned/i);
      assert.match(t, /Extra Activity/); assert.match(t, /1 h 00 min · avg 152 bpm · max 171 bpm/);
      assert.match(t, /Cardio this week: 60 min/);
    });
    await shot(page, "2b-today-extra-confirmed");
    await page.reload(); await page.waitForTimeout(4500);
    check("confirm extra: not re-offered after reload", async () => {});
    assert.doesNotMatch(await text(page), /Recorded, not planned/i);
    check("no page errors (extra)", () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  /* 3. Dismiss */
  {
    const { page, ctx } = await open(browser, { withCardio: true, workouts: [wk("C1", "swimming", 30)] });
    await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    await page.waitForTimeout(500);
    const ov = await ls(page, "overrides");
    check("dismiss: key recorded, nothing counted", () => { assert.deepEqual(ov[TODAY].dismissedWorkouts, ["polar:C1"]); assert.equal(ov[TODAY].activities, undefined); });
    await page.reload(); await page.waitForTimeout(4500);
    check("dismiss: not re-offered after reload", async () => {});
    assert.doesNotMatch(await text(page), /Recorded, not planned/i);
    await ctx.close();
  }
  /* 4. Skip day with an extra */
  {
    const act = { id: "m1", name: "Walk", typeId: null, source: "manual", durationMin: 35, distanceKm: 3.1 };
    const { page, ctx } = await open(browser, { withCardio: true, overrides: { [TODAY]: { skip: "sick", activities: [act] } } });
    const t = await text(page);
    check("skip day: notice says no sessions removed by the extra; extra shown with detail", () => {
      assert.match(t, /Sick day/); assert.match(t, /Extra Activity/); assert.match(t, /35 min · 3.1 km/);
      assert.match(t, /Cardio this week: 35 min/);
      assert.doesNotMatch(t, /Target:/); // planned slot stays cleared
    });
    check("skip day: still labelled as skip, not a training day (no Run section)", () => assert.doesNotMatch(t, /Run — Easy|Easy run/));
    await shot(page, "3-today-skip-day-with-extra");
    await ctx.close();
  }
  /* 5. Calendar form with cardioTypes */
  {
    const { page, ctx, errors } = await open(browser, { withCardio: true });
    await page.getByRole("button", { name: /Calendar/i }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: new RegExp(`^${now.getDate()}\\b`) }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const opts = await page.locator('select[aria-label="Activity type"] option').allTextContents();
    check("calendar form (with cardioTypes): picker lists the coach's types plus Other", () => assert.deepEqual(opts, ["Run", "Cycling", "Swim", "Other"]));
    await page.selectOption('select[aria-label="Activity type"]', "bike", { timeout: 3000 });
    await page.fill('input[aria-label="min or m:ss"]', "1:15:30");
    await page.fill('input[aria-label="km"]', "32,5");
    await page.fill('input[aria-label="avg bpm"]', "138");
    await page.fill('input[aria-label="max bpm"]', "165");
    await shot(page, "4-calendar-extras-form-with-cardiotypes");
    await page.locator('select[aria-label="Activity type"]').locator("xpath=ancestor::div[1]").getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForTimeout(500);
    const ov = await ls(page, "overrides");
    const key = Object.keys(ov).find((k) => ov[k].activities);
    check("calendar add: Phase 2 entry shape, minutes from h:mm:ss", () => {
      const a = ov[key].activities[0];
      assert.equal(a.name, "Cycling"); assert.equal(a.typeId, "bike"); assert.equal(a.source, "manual");
      assert.equal(a.durationMin, 75.5); assert.equal(a.distanceKm, 32.5); assert.equal(a.hrAvg, 138); assert.equal(a.hrMax, 165);
      assert.ok(a.id);
    });
    await shot(page, "4b-calendar-extra-added");
    await page.getByRole("button", { name: /^Remove Cycling/ }).click();
    await page.waitForTimeout(400);
    check("calendar remove still works", async () => {});
    assert.equal(((await ls(page, "overrides")) || {})[key]?.activities, undefined);
    check("no page errors (calendar)", () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  /* 7. Strength workout on a planned strength day (Today, Train, Calendar) */
  {
    const gymW = wk("G1", "strengthTraining", 55, { distance_km: null, hr_avg: 118, hr_max: 150, started_at: `${TODAY}T18:00:00Z` });
    const { page, ctx, errors } = await open(browser, { withCardio: true, strengthDay: true, workouts: [gymW] });
    let t = await text(page);
    check("planned strength day (Today): offered inside the strength card, not under Recorded", () => {
      assert.match(t, /Recorded strength session/i);
      assert.doesNotMatch(t, /Strength · not cardio/i);
      assert.doesNotMatch(t, /RECORDED\s*\n\s*Your watch recorded/i);
    });
    check("planned strength day: weekly cardio line unchanged by the gym session", () => assert.match(t, /Cardio this week: 0 min/));
    await shot(page, "6-today-strength-planned-day");
    await page.getByRole("button", { name: "Train", exact: true }).first().click();
    await page.waitForTimeout(600);
    check("planned strength day (Train): the offer appears there too", async () => {});
    assert.match(await text(page), /Recorded strength session/i);
    await shot(page, "6b-train-strength-offer");
    await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
    await page.waitForTimeout(500);
    const ov = await ls(page, "overrides"), log = await ls(page, "log");
    check("planned strength day: confirm records only the key — no activity, no ticks, no numbers", () => {
      assert.deepEqual(ov[TODAY].dismissedWorkouts, ["polar:G1"]);
      assert.equal(ov[TODAY].activities, undefined);
      assert.ok(!log || !log[TODAY] || (Object.keys(log[TODAY].done || {}).length === 0 && !log[TODAY].numbers));
    });
    check("planned strength day: gone after confirm", async () => {});
    assert.doesNotMatch(await text(page), /Recorded strength session/i);
    check("no page errors (strength planned)", () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  /* 8. Calendar on a planned strength day */
  {
    const gymW = wk("G2", "strengthTraining", 55, { distance_km: null, started_at: `${TODAY}T18:00:00Z` });
    const { page, ctx } = await open(browser, { withCardio: true, strengthDay: true, workouts: [gymW] });
    await page.getByRole("button", { name: /Calendar/i }).first().click();
    await page.waitForTimeout(800);
    check("planned strength day (Calendar): offer in the strength row", async () => {});
    assert.match(await text(page), /Recorded strength session/i);
    await shot(page, "6c-calendar-strength-offer");
    await ctx.close();
  }
  /* 9. Strength workout on a rest day (no strength slot) */
  {
    const gymW = wk("G3", "strengthTraining", 55, { distance_km: null, hr_avg: 118, hr_max: 150, started_at: `${TODAY}T18:00:00Z` });
    const { page, ctx, errors } = await open(browser, { withCardio: true, strengthDay: false, workouts: [gymW, wk("B9", "cycling", 30)] });
    let t = await text(page);
    check("no strength slot: offered under Recorded as Strength · not cardio", () => {
      assert.match(t, /Strength · not cardio/i);
      assert.match(t, /Strength training · 55 min/);
      assert.doesNotMatch(t, /Recorded strength session/i);
    });
    await shot(page, "6d-today-strength-rest-day");
    await page.locator("div.rounded-lg", { hasText: "Strength · not cardio" }).getByRole("button", { name: "Confirm", exact: true }).click();
    await page.waitForTimeout(500);
    const ov = await ls(page, "overrides");
    check("no strength slot: confirm writes one kind:strength activity", () => {
      const a = ov[TODAY].activities;
      assert.equal(a.length, 1); assert.equal(a[0].kind, "strength"); assert.equal(a[0].name, "Strength training"); assert.equal(a[0].durationMin, 55);
    });
    t = await text(page);
    check("confirmed strength extra: marked not cardio; weekly cardio line stays 0", () => {
      assert.match(t, /55 min.*not cardio|1 h.*not cardio/i);
      assert.match(t, /Cardio this week: 0 min/);
    });
    await shot(page, "6e-today-strength-extra-confirmed");
    await page.getByRole("button", { name: "Confirm", exact: true }).first().click(); // the cycling extra
    await page.waitForTimeout(500);
    check("a cardio extra the same day still counts (30 min)", async () => {});
    assert.match(await text(page), /Cardio this week: 30 min/);
    await page.reload(); await page.waitForTimeout(4500);
    check("confirmed strength extra not re-offered after reload", async () => {});
    assert.doesNotMatch(await text(page), /Strength · not cardio/i);
    check("no page errors (strength rest day)", () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  /* 6. Calendar form without cardioTypes (compiled programme) + signed out */
  {
    const { page, ctx, errors } = await open(browser, { withCardio: false, signedIn: false });
    const t0 = await text(page);
    check("signed out, no cardio fields: Today renders, no Recorded group, no weekly line", () => {
      assert.doesNotMatch(t0, /Recorded/i); assert.doesNotMatch(t0, /Cardio this week/); assert.doesNotMatch(t0, /Target:/);
    });
    await page.getByRole("button", { name: /Calendar/i }).first().click();
    await page.waitForTimeout(800);
    const opts = await page.locator('select[aria-label="Activity type"] option').allTextContents();
    check("calendar form (no cardioTypes): picker shows Other only", () => assert.deepEqual(opts, ["Other"]));
    await page.fill('input[placeholder="e.g. Long walk"]', "Long walk");
    await page.fill('input[aria-label="min or m:ss"]', "45");
    await shot(page, "5-calendar-extras-form-no-cardiotypes");
    await page.locator('select[aria-label="Activity type"]').locator("xpath=ancestor::div[1]").getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForTimeout(500);
    const ov = await ls(page, "overrides");
    const key = Object.keys(ov).find((k) => ov[k].activities);
    check("calendar add (Other): name kept, typeId null, duration stored", () => {
      const a = ov[key].activities[0];
      assert.equal(a.name, "Long walk"); assert.equal(a.typeId, null); assert.equal(a.durationMin, 45); assert.equal(a.distanceKm, undefined);
    });
    check("no page errors (signed out)", () => assert.deepEqual(errors, []));
    await ctx.close();
  }
} catch (e) { results.push(["FAIL", "SCRIPT ERROR " + String(e.message).split("\n")[0]]);
} finally {
  await browser.close();
  server.kill();
}
for (const [s, n] of results) console.log(s === "ok" ? "  ok  " : "  FAIL", n);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\nbrowser check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
