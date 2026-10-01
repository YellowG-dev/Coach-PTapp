import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const OUT = "/home/user/Coach-PTapp/briefs/reports/step9-phase4-program-tab-data";
const CLIENTS = [
  { name: "Henna", dir: "/home/user/Henna-PTapp", prefix: "ptAppHenna_", file: "program-henna.js", sample: "Your goals", deep: "Training through a rough patch" },
  { name: "Joonatan", dir: "/home/user/Joonatan-PTapp", prefix: "ptAppJoonatan_", file: "program-joonatan.js", sample: "What gets tracked", deep: "watch the 7-day rolling average" },
  { name: "Juha", dir: "/home/user/Juha-PTapp", prefix: "ptAppParent_", file: "program-juha.js", sample: "Exercise rules", deep: "Permanently excluded:" },
];
const THEMES = ["amber-slate", "rose-linen"];
const UID = "11111111-2222-3333-4444-555555555555";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp: 4102444800, role: "authenticated" })}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
  user: { id: UID, aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };

const results = [];
const check = (n, fn) => { try { fn(); results.push(["ok", n]); } catch (e) { results.push(["FAIL", n + " — " + e.message.split("\n")[0]]); } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());

async function programTab(c, port, theme, withView, def) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({ prefix, theme, session }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(prefix + "auth", JSON.stringify(session));
    localStorage.setItem(prefix + "settings", JSON.stringify({ gentler: false, hrMax: null, theme }));
  }, { prefix: c.prefix, theme, session });
  await page.route("**/rest/v1/**", (route) => {
    const u = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.includes("/programs")) return json(withView ? [{ id: "p1", name: "Fixture", assigned_to: UID, effective_from: "-infinity", definition: def }] : []);
    return json([]);
  });
  await page.route("**/functions/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) }));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(3500);      // the app fetches the programmes and caches them
  await page.reload();                  // the cached programme is the one in force at the next open
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "Program", exact: true }).first().click();
  await page.waitForTimeout(800);
  // open every card so the screenshot shows the whole tab
  await page.evaluate(() => document.querySelectorAll("button.w-full.text-left.border-l-4").forEach((b) => { if (!b.nextElementSibling) b.click(); }));
  await page.waitForTimeout(500);
  const text = await page.evaluate(() => document.body.innerText);
  const png = await page.screenshot({ fullPage: true });
  const stored = await page.evaluate((p) => { try { return JSON.parse(localStorage.getItem(p + "programsV2")); } catch { return null; } }, c.prefix);
  await ctx.close();
  return { text, png, errors, stored };
}

let port = 8770;
for (const c of CLIENTS) {
  const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: c.dir, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const { PROGRAM } = await import(`${c.dir}/src/core/${c.file}`);
  const programView = JSON.parse(readFileSync(`${c.dir}/phase4/programview.json`, "utf8"));
  const def = { ...JSON.parse(JSON.stringify(PROGRAM)), programView };
  for (const theme of THEMES) {
    const oldR = await programTab(c, port, theme, false, null);
    const newR = await programTab(c, port, theme, true, def);
    const tag = `${c.name} ${theme}`;
    check(`${tag}: old (no programView) shows the hand-written tab`, () => assert.ok(oldR.text.includes(c.sample)));
    check(`${tag}: new run really rendered from the delivered definition (cached row has programView)`, () =>
      assert.ok(newR.stored && newR.stored.rows[0].definition.programView.length === programView.length));
    check(`${tag}: new tab shows the card "${c.sample}"`, () => assert.ok(newR.text.includes(c.sample)));
    check(`${tag}: card bodies open in both (text from inside a card is present)`, () => { assert.ok(oldR.text.includes(c.deep)); assert.ok(newR.text.includes(c.deep)); });
    check(`${tag}: no page errors (old, new)`, () => assert.deepEqual([...oldR.errors, ...newR.errors], []));
    // side by side
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    const img = (b) => `data:image/png;base64,${b.toString("base64")}`;
    await page.setContent(`<body style="margin:0;background:#222;font:14px sans-serif;color:#eee"><div style="display:flex;gap:16px;padding:12px;align-items:flex-start">
      <div><p>OLD — hand-written (no programView)</p><img style="width:420px" src="${img(oldR.png)}"></div>
      <div><p>NEW — generated from programView</p><img style="width:420px" src="${img(newR.png)}"></div></div></body>`);
    await page.screenshot({ path: `${OUT}/${c.name.toLowerCase()}-${theme}-old-vs-new.png`, fullPage: true });
    await page.close();
  }
  server.kill();
  port++;
}
await browser.close();
for (const [s, n] of results) console.log(s === "ok" ? "  ok  " : "  FAIL", n);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\nphase 4 browser check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
