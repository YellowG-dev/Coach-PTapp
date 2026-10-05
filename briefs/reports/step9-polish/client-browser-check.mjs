// Step 9 polish — client browser check (Henna build).
// Run from anywhere: node briefs/reports/step9-polish/client-browser-check.mjs
// Serves /home/user/Henna-PTapp with a tiny node static server, mocks Supabase,
// and checks P1 (Rearranged badge / Calendar border) and P2 (extras subtitle).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const { PROGRAM } = await import("/home/user/Henna-PTapp/src/core/program-henna.js");
const OUT = "/home/user/Coach-PTapp/briefs/reports/step9-polish";
const DIR = "/home/user/Henna-PTapp", PREFIX = "ptAppHenna_", PORT = 8791;
const pad = (n) => String(n).padStart(2, "0");
const kd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const TODAY = kd(now);
const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
const TOMORROW = kd(tmr);
const UID = "11111111-2222-3333-4444-555555555555";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp: 4102444800, role: "authenticated" })}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
  user: { id: UID, aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
const ride = { user_id: UID, vendor: "polar", vendor_session_id: "C1", day: TODAY, sport: "cycling", source: null,
  started_at: `${TODAY}T15:00:00Z`, duration_minutes: 50, distance_km: 18, hr_avg: 120, hr_max: 150 };

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const p = path.join(DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const results = [];
const check = (n, fn) => { try { fn(); results.push(["ok", n]); } catch (e) { results.push(["FAIL", n + " — " + e.message.split("\n")[0]]); } };

async function open({ workouts = [], overrides = {}, tab = null }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({ prefix, session, overrides }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(prefix + "auth", JSON.stringify(session));
    localStorage.setItem(prefix + "settings", JSON.stringify({ gentler: false, hrMax: null, theme: "rose-linen" }));
    localStorage.setItem(prefix + "overrides", JSON.stringify(overrides));
  }, { prefix: PREFIX, session, overrides });
  await page.route("**/rest/v1/**", (route) => {
    const u = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.includes("/programs")) return json([{ id: "p1", name: "Fixture", assigned_to: UID, effective_from: "-infinity", definition: PROGRAM }]);
    if (u.includes("/wearable_workouts")) return json(workouts);
    if (u.includes("/wearable_connections")) return json([{ user_id: UID, vendor: "polar", status: "active", connected_at: null, last_synced_at: null }]);
    return json([]);
  });
  await page.route("**/functions/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) }));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(4500);
  if (tab) await gotoTab(page, tab);
  return { page, ctx, errors };
}
const gotoTab = async (page, tab) => { await page.getByRole("button", { name: tab, exact: true }).first().click(); await page.waitForTimeout(800); };
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
// Calendar cells of the shown month: day d is the d-th cell from the first "1".
const calCell = (page, day) => page.evaluate((day) => {
  const cells = [...document.querySelectorAll("button.aspect-square")];
  const first = cells.findIndex((c) => c.querySelector("span") && c.querySelector("span").textContent.trim() === "1");
  const c = cells[first + day - 1];
  return c ? { n: c.querySelector("span").textContent.trim(), style: getComputedStyle(c).borderStyle } : null;
}, day);

/* A. A confirmed watch workout today, no slot change; tomorrow's slot moved. */
{
  const { page, ctx, errors } = await open({ workouts: [ride], overrides: { [TOMORROW]: { strength: "b" } } });
  let t = await text(page);
  check("A: the ride is offered as a watch workout before confirming", () => { assert.match(t, /Your watch recorded these/i); assert.match(t, /Cycling · 50 min/); });
  check("A: before confirming, no Rearranged badge today", () => assert.doesNotMatch(t, /Rearranged/));
  const offer = page.getByRole("button", { name: "Confirm", exact: true });
  await offer.first().click();
  await page.waitForTimeout(600);
  const ov = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), PREFIX + "overrides");
  check("A: confirming writes one source:wearable activity today and no slot keys", () => {
    const day = ov[TODAY];
    assert.equal(day.activities.length, 1);
    assert.equal(day.activities[0].source, "wearable");
    assert.ok(!("strength" in day) && !("yoga" in day), JSON.stringify(day));
  });
  t = await text(page);
  check("A: Extra Activity section shows 'From your watch'", () => { assert.match(t, /Extra Activity/); assert.match(t, /From your watch/); });
  check("A: and not 'Added from Calendar'", () => assert.doesNotMatch(t, /Added from Calendar/));
  check("A: no Rearranged badge after confirming the watch workout", () => assert.doesNotMatch(t, /Rearranged/));
  await shot(page, "1-today-watch-extra-no-badge");

  await gotoTab(page, "Calendar");
  const today = await calCell(page, now.getDate());
  check("A: Calendar border for today (watch extra only) is solid", () => assert.deepEqual(today, { n: String(now.getDate()), style: "solid" }));
  if (tmr.getMonth() === now.getMonth()) {
    const tom = await calCell(page, tmr.getDate());
    check("A: Calendar border for tomorrow (slot moved) is dashed", () => assert.deepEqual(tom, { n: String(tmr.getDate()), style: "dashed" }));
  }
  await shot(page, "2-calendar-solid-today-dashed-tomorrow");
  check("A: no page errors", () => assert.deepEqual(errors, []));
  await ctx.close();
}

/* B. A moved slot today → badge and dashed border. */
{
  const { page, ctx, errors } = await open({ overrides: { [TODAY]: { strength: "b" } } });
  const t = await text(page);
  check("B: moved slot today → Rearranged badge", () => assert.match(t, /Rearranged/));
  await shot(page, "3-today-moved-slot-badge");
  await gotoTab(page, "Calendar");
  const c = await calCell(page, now.getDate());
  check("B: Calendar border for today is dashed", () => assert.equal(c && c.style, "dashed"));
  check("B: no page errors", () => assert.deepEqual(errors, []));
  await ctx.close();
}

/* C. A manual extra plus a watch extra → mixed wording; still no badge. */
{
  const overrides = { [TODAY]: { activities: [
    { id: "m1", name: "Walk", source: "manual" },
    { id: "polar:C9", name: "Cycling", source: "wearable", typeId: null, workout: { vendor: "polar", vendorSessionId: "C9" }, durationMin: 30 },
  ] } };
  const { page, ctx, errors } = await open({ overrides });
  const t = await text(page);
  check("C: mixed extras → 'From Calendar and your watch'", () => assert.match(t, /From Calendar and your watch/));
  check("C: extras only → no Rearranged badge", () => assert.doesNotMatch(t, /Rearranged/));
  await shot(page, "4-today-mixed-extras");
  check("C: no page errors", () => assert.deepEqual(errors, []));
  await ctx.close();
}

await browser.close(); server.close();
for (const [s, n] of results) console.log(s === "ok" ? "  ok  " : "  FAIL", n);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\nstep9-polish client browser check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
