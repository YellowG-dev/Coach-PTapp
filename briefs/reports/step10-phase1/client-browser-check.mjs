// Step 10 Phase 1 — client browser check (headless Chromium), Juha build.
// Run from anywhere: node client-browser-check.mjs
//
// Programme: Coach fixture `juha-2026-10` with `auto: { source: "steps", min: 10000 }`
// on chk-walk, delivered through a stubbed Supabase. Signed in, the pull
// succeeds (so the merge gate opens), Oura connected. Screens:
//   1  8,412 steps  -> "· 8,412 / 10,000 steps", unticked
//   2  10,250 steps -> "· 10,250 / 10,000 steps", ticked by itself
//   3  Oura connected, no row for today -> "· steps not synced yet"
//   4  a manual un-tick at 10,250 stays un-ticked after a re-render and a reload
//   5  no Oura connection -> the presc alone, unchanged
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright");

const OUT = "/home/user/Coach-PTapp/briefs/reports/step10-phase1";
const DIR = "/home/user/Juha-PTapp", PREFIX = "ptAppParent_";
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const UID = "11111111-2222-3333-4444-555555555555";

const rows = JSON.parse(fs.readFileSync("/home/user/Coach-PTapp/fixtures/programs.json", "utf8"));
const DEF = clone(rows.find((r) => r.id === "juha-2026-10").definition);
const walk = DEF.daily.find((s) => s.key === "check").tasks.find((t) => t.id === "chk-walk");
walk.auto = { source: "steps", min: 10000 };
const { validate } = await import("/home/user/Juha-PTapp/src/core/program-schema.js");
assert.deepEqual(validate(DEF).errors, [], "fixture with auto validates");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp: 4102444800, role: "authenticated" })}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
  user: { id: UID, aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };

// A plain static server over the built repo (bundle.js + styles.css + index.html).
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const p = path.join(DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(8791);

const browser = await chromium.launch();
const results = [];
const check = (n, fn) => { try { fn(); results.push(["ok", n]); } catch (e) { results.push(["FAIL", n + " — " + e.message.split("\n")[0]]); } };

async function open({ steps, oura = true }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({ prefix, session }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(prefix + "auth", JSON.stringify(session));
    localStorage.setItem(prefix + "settings", JSON.stringify({ gentler: false, hrMax: null, theme: "amber-slate" }));
  }, { prefix: PREFIX, session });
  await page.route("**/rest/v1/**", (route) => {
    const u = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.includes("/programs")) return json([{ id: "juha-auto", name: "Fixture with auto", assigned_to: UID, effective_from: "-infinity", definition: DEF }]);
    if (u.includes("/wearable_connections")) return json(oura ? [{ user_id: UID, vendor: "oura", status: "active", connected_at: null, last_synced_at: new Date().toISOString() }] : []);
    if (u.includes("/wearable_days")) return json(steps == null ? [] : [{ user_id: UID, vendor: "oura", day: TODAY, steps, sleep_minutes: null, readiness: null, resting_hr: null, hrv: null }]);
    return json([]);   // day_logs, day_overrides, user_settings, workouts: an empty, successful pull
  });
  await page.route("**/functions/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) }));
  await page.goto("http://localhost:8791/index.html");
  await page.waitForTimeout(3500);   // fetches and caches the delivered programme
  await page.reload();               // the cached programme is in force at the next open
  await page.waitForTimeout(4500);
  return { page, ctx, errors };
}
const stored = (page) => page.evaluate((a) => (JSON.parse(localStorage.getItem(a[0] + "log") || "{}")[a[1]]) || {}, [PREFIX, TODAY]);
const walkRow = (page) => page.locator('[role="button"]').filter({ hasText: "Walk 10,000 steps" }).first();
const rowText = async (page) => (await walkRow(page).innerText()).replace(/\s+/g, " ");
const rowTicked = (page) => walkRow(page).evaluate((el) => getComputedStyle(el.querySelector("p")).textDecorationLine.includes("through") /* struck-out = ticked */);
const shot = async (page, n) => { await walkRow(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/${n}.png` }); };

/* 1 — 8,412: shown, not ticked */
{
  const { page, ctx, errors } = await open({ steps: 8412 });
  const t = await rowText(page);
  check("1: line reads 'Daily step target · 8,412 / 10,000 steps'", () => assert.match(t, /Daily step target · 8,412 \/ 10,000 steps/));
  const ticked1 = await rowTicked(page);
  check("1: not ticked on screen", () => assert.equal(ticked1, false));
  const s = await stored(page); check("1: stored day has no chk-walk tick", () => assert.equal(s.done?.["chk-walk"], undefined));
  check("1: no page errors", () => assert.deepEqual(errors, []));
  await shot(page, "1-client-steps-8412-unticked");
  await ctx.close();
}
/* 2 — 10,250: ticks itself */
{
  const { page, ctx, errors } = await open({ steps: 10250 });
  const t = await rowText(page);
  const ticked = await rowTicked(page);
  const s = await stored(page);
  check("2: line reads 'Daily step target · 10,250 / 10,000 steps'", () => assert.match(t, /Daily step target · 10,250 \/ 10,000 steps/));
  check("2: ticked on screen", () => assert.equal(ticked, true));
  check("2: tick written into the day log (done.chk-walk === true)", () => assert.equal(s.done?.["chk-walk"], true));
  check("2: no page errors", () => assert.deepEqual(errors, []));
  await shot(page, "2-client-steps-10250-ticked");

  /* 4 — manual un-tick stays un-ticked after a re-render and a reload */
  await walkRow(page).click();
  await page.waitForTimeout(600);
  const afterTap = await stored(page);
  check("4: tapping writes done.chk-walk === false", () => assert.equal(afterTap.done?.["chk-walk"], false));
  // Re-render: away to the Calendar tab and back; then a full reload (re-runs the merge and the auto-tick effect).
  await page.getByRole("button", { name: "Calendar", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Today", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const r1 = await rowTicked(page), s1 = await stored(page);
  check("4: still un-ticked after a re-render (screen + store)", () => { assert.equal(r1, false); assert.equal(s1.done?.["chk-walk"], false); });
  await page.reload();
  await page.waitForTimeout(5000);
  const r2 = await rowTicked(page), s2 = await stored(page), t2 = await rowText(page);
  check("4: still un-ticked after a reload at 10,250 steps (screen + store)", () => { assert.equal(r2, false); assert.equal(s2.done?.["chk-walk"], false); });
  check("4: the steps line still shows", () => assert.match(t2, /10,250 \/ 10,000 steps/));
  await shot(page, "4-client-manual-untick-stays");
  check("4: no page errors", () => assert.deepEqual(errors, []));
  await ctx.close();
}
/* 3 — Oura connected, no number yet */
{
  const { page, ctx, errors } = await open({ steps: null });
  const t = await rowText(page);
  const s = await stored(page);
  check("3: line reads 'Daily step target · steps not synced yet'", () => assert.match(t, /Daily step target · steps not synced yet/));
  check("3: nothing written (unknown is never 0)", () => assert.equal(s.done?.["chk-walk"], undefined));
  check("3: no page errors", () => assert.deepEqual(errors, []));
  await shot(page, "3-client-steps-not-synced-yet");
  await ctx.close();
}
/* 5 — no Oura connection: presc alone */
{
  const { page, ctx, errors } = await open({ steps: null, oura: false });
  const t = await rowText(page);
  check("5: presc alone, no steps text", () => { assert.match(t, /Daily step target/); assert.doesNotMatch(t, /steps not synced|\/ 10,000 steps/); });
  check("5: no page errors", () => assert.deepEqual(errors, []));
  await ctx.close();
}

await browser.close();
server.close();
const lines = results.map(([s, n]) => `${s === "ok" ? "ok  " : "FAIL"} ${n}`);
const fails = results.filter(([s]) => s !== "ok").length;
lines.push(`\n${results.length - fails} passed, ${fails} failed`);
console.log(lines.join("\n"));
fs.writeFileSync(`${OUT}/client-browser-check-output.txt`, lines.join("\n") + "\n");
process.exit(fails ? 1 : 0);
