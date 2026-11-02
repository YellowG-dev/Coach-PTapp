import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const ed = await import("/home/user/Coach-PTapp/src/core/editor.js");
const { PROGRAM } = await import("/home/user/Henna-PTapp/src/core/program-henna.js");
const OUT = "/home/user/Coach-PTapp/briefs/reports/step9-phase6-standard-slots";
const DIR = "/home/user/Henna-PTapp", PREFIX = "ptAppHenna_";
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const UID = "11111111-2222-3333-4444-555555555555";

// Built exactly as the Coach editor builds it.
let P2 = ed.addStandardSlot(clone(PROGRAM), "walk");                 // Walk slot, no block yet
let P1 = ed.addBlock(P2, "walk", "Easy walk", "Easy");               // + a block
P1 = ed.addNewExercise(P1, "walk", "easy-walk", { name: "Walk time", type: "number", unit: "min" }, new Set());
const walkTask = P1.blocks.walk["easy-walk"].exercises[0].id;
P1 = ed.setBlockCardio(P1, "walk", "easy-walk", { durationMin: 30, note: "Easy pace", durationTaskId: walkTask });
P1 = ed.useStandardCardioTypes(P1);
for (const w of ["A", "B"]) for (const dow of ["0", "1", "2", "3", "4", "5", "6"]) P1 = ed.setScheduleCell(P1, w, dow, "walk", "easy-walk");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp: 4102444800, role: "authenticated" })}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
  user: { id: UID, aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };

const wk = (id, sport, mins, extra = {}) => ({ user_id: UID, vendor: "polar", vendor_session_id: id, day: TODAY, sport, source: null,
  started_at: `${TODAY}T0${sport === "yoga" ? 8 : 7}:00:00Z`, duration_minutes: mins, distance_km: null, hr_avg: 105, hr_max: 130, ...extra });

const server = spawn("python3", ["-m", "http.server", "8790"], { cwd: DIR, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const results = [];
const check = (n, fn) => { try { fn(); results.push(["ok", n]); } catch (e) { results.push(["FAIL", n + " — " + e.message.split("\n")[0]]); } };

async function open({ def, workouts = [], overrides = {}, theme = "rose-linen", tab = null }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({ prefix, theme, session, overrides }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(prefix + "auth", JSON.stringify(session));
    localStorage.setItem(prefix + "settings", JSON.stringify({ gentler: false, hrMax: null, theme }));
    localStorage.setItem(prefix + "overrides", JSON.stringify(overrides));
  }, { prefix: PREFIX, theme, session, overrides });
  await page.route("**/rest/v1/**", (route) => {
    const u = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.includes("/programs")) return json([{ id: "p1", name: "Fixture", assigned_to: UID, effective_from: "-infinity", definition: def }]);
    if (u.includes("/wearable_workouts")) return json(workouts);
    if (u.includes("/wearable_connections")) return json([{ user_id: UID, vendor: "polar", status: "active", connected_at: null, last_synced_at: null }]);
    return json([]);
  });
  await page.route("**/functions/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) }));
  await page.goto("http://localhost:8790/index.html");
  await page.waitForTimeout(3500);   // fetches and caches the delivered programme
  await page.reload();               // the cached programme is the one in force at the next open
  await page.waitForTimeout(4500);
  if (tab) { await page.getByRole("button", { name: tab, exact: true }).first().click(); await page.waitForTimeout(800); }
  return { page, ctx, errors };
}
const ls = (page, k) => page.evaluate((a) => JSON.parse(localStorage.getItem(a[0] + a[1]) || "null"), [PREFIX, k]);
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

/* 1. Today with a delivered Walk slot, in both themes */
for (const theme of ["rose-linen", "amber-slate"]) {
  const { page, ctx, errors } = await open({ def: P1, theme, workouts: [wk("W1", "walking", 35), wk("Y1", "yoga", 40)] });
  const t = await text(page);
  const hdr = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.includes("Easy walk"));
    const head = h && h.closest('[style*="border-left-color"]');
    const svg = head && head.querySelector("svg");
    return head ? { color: getComputedStyle(head).borderLeftColor, icon: svg ? svg.getAttribute("class") : "", iconColor: svg ? getComputedStyle(svg).color : "" } : null;
  });
  check(`[${theme}] Today shows the Walk session`, () => assert.ok(t.includes("Easy walk")));
  check(`[${theme}] Walk section uses the walk colour (#C9D46B) and the Footprints icon`, () => {
    assert.ok(hdr, "walk header not found");
    assert.equal(hdr.color, "rgb(201, 212, 107)");
    assert.match(hdr.icon, /lucide-footprints/);
    assert.equal(hdr.iconColor, "rgb(201, 212, 107)");
  });
  check(`[${theme}] planned walk: target line and the watch suggestion appear`, () => { assert.match(t, /Target: 30 min/); assert.match(t, /Recorded by your watch/i); });
  check(`[${theme}] weekly cardio line is shown (Walk declares a duration task)`, () => assert.match(t, /Cardio this week: 0 min/));
  check(`[${theme}] yoga on a day with no yoga: under Recorded as "Yoga · not cardio"`, () => assert.match(t, /Yoga · not cardio/i));
  if (theme === "rose-linen") {
    await shot(page, "1-today-walk-slot");
    await page.locator("div.rounded-lg", { hasText: "Yoga · not cardio" }).getByRole("button", { name: "Confirm", exact: true }).click();
    await page.waitForTimeout(500);
    let ov = await ls(page, "overrides");
    check("confirm yoga extra writes one kind:yoga activity", () => {
      const a = ov[TODAY].activities;
      assert.equal(a.length, 1); assert.equal(a[0].kind, "yoga"); assert.equal(a[0].name, "Yoga"); assert.equal(a[0].durationMin, 40);
    });
    let t2 = await text(page);
    check("the confirmed yoga extra shows 'not cardio' and the weekly cardio line stays 0", () => { assert.match(t2, /Yoga.*not cardio/is); assert.match(t2, /Cardio this week: 0 min/); });
    await page.getByRole("button", { name: "Confirm", exact: true }).first().click();   // the planned walk
    await page.waitForTimeout(500);
    const log = await ls(page, "log");
    check("confirming the planned walk writes minutes to the declared task, and only that adds to the week", async () => {});
    assert.equal(log[TODAY].numbers[walkTask], 35);
    assert.match(await text(page), /Cardio this week: 35 min/);
    await shot(page, "1b-today-walk-and-yoga-confirmed");
    await page.reload(); await page.waitForTimeout(4500);
    check("neither workout is re-offered after reload", async () => {});
    const t3 = await text(page);
    assert.doesNotMatch(t3, /Recorded by your watch/i); assert.doesNotMatch(t3, /Yoga · not cardio/i);
  }
  check(`[${theme}] no page errors`, () => assert.deepEqual(errors, []));
  await ctx.close();
}

/* 2. Yoga on a planned yoga day: OK only */
{
  const { page, ctx, errors } = await open({ def: P1, overrides: { [TODAY]: { yoga: "session" } }, workouts: [wk("Y2", "yoga", 45)] });
  const t = await text(page);
  check("planned yoga day: offered inside the yoga block, not under Recorded", () => { assert.match(t, /Recorded yoga session/i); assert.doesNotMatch(t, /Yoga · not cardio/i); });
  const btns = await page.locator("div.rounded-lg", { hasText: "Recorded yoga session" }).getByRole("button").allTextContents();
  check("planned yoga day: a single OK button", () => assert.deepEqual(btns, ["OK"]));
  await shot(page, "2-today-yoga-planned-day-ok");
  await page.locator("div.rounded-lg", { hasText: "Recorded yoga session" }).getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(500);
  const ov = await ls(page, "overrides"), log = await ls(page, "log");
  check("OK records only the key — no activity, no ticks, no numbers", () => {
    assert.deepEqual(ov[TODAY].dismissedWorkouts, ["polar:Y2"]);
    assert.equal(ov[TODAY].activities, undefined);
    assert.ok(!log || !log[TODAY] || (!log[TODAY].numbers && Object.keys(log[TODAY].done || {}).length === 0));
  });
  check("planned yoga day: gone after OK", async () => {});
  assert.doesNotMatch(await text(page), /Recorded yoga session/i);
  check("no page errors (yoga planned)", () => assert.deepEqual(errors, []));
  await ctx.close();
}

/* 3. Calendar: a slot with nothing to pick is hidden */
{
  const { page, ctx, errors } = await open({ def: P2, tab: "Calendar" });
  const body = await text(page);
  const legend = await page.evaluate(() => [...document.querySelectorAll("span.flex.items-center.gap-1\\.5.text-\\[11px\\]")].map((s) => s.textContent.trim()));
  check("empty Walk slot is left out of the Calendar legend", () => { assert.ok(!legend.includes("Walk"), legend.join(",")); assert.ok(legend.includes("Strength") && legend.includes("Yoga"), legend.join(",")); });
  check("and out of the day panel", () => { assert.doesNotMatch(body, /No walk/); assert.match(body, /No strength|Gym|Day [ABC]|No yoga/); });
  await shot(page, "3-calendar-empty-slot-hidden");
  await ctx.close();
}
{
  const { page, ctx } = await open({ def: P2, tab: "Calendar", overrides: { [TODAY]: { walk: "easy-walk" } } });
  const body = await text(page);
  check("the same empty slot shows on a day that has a value in it (history stays visible)", () => assert.match(body, /walk/i));
  const legend = await page.evaluate(() => [...document.querySelectorAll("span.flex.items-center.gap-1\\.5.text-\\[11px\\]")].map((s) => s.textContent.trim()));
  check("and in the legend while that month has such a day", () => assert.ok(legend.includes("Walk"), legend.join(",")));
  await shot(page, "3b-calendar-empty-slot-shown-on-a-day-with-a-value");
  await ctx.close();
}
{
  const { page, ctx } = await open({ def: P1, tab: "Calendar" });
  const legend = await page.evaluate(() => [...document.querySelectorAll("span.flex.items-center.gap-1\\.5.text-\\[11px\\]")].map((s) => s.textContent.trim()));
  check("a Walk slot with a block appears in the legend and the day panel", async () => {});
  assert.ok(legend.includes("Walk"), legend.join(","));
  assert.match(await text(page), /Easy walk/);
  await shot(page, "3c-calendar-walk-with-block");
  await ctx.close();
}

await browser.close(); server.kill();
for (const [s, n] of results) console.log(s === "ok" ? "  ok  " : "  FAIL", n);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\nphase 6 client browser check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
