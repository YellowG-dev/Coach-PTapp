// Step 9 polish — Coach browser check: "Delete version" (P4).
// Run: node briefs/reports/step9-polish/coach-browser-check.mjs
// Bundles the real app.jsx and the REAL deleteFutureVersion / canDeleteVersion
// from src/core/data.js. Only loadAll and the supabase client are stubbed; the
// client records the query chain it is given, so the check sees the guarded
// delete exactly as it would be sent.
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
process.chdir("/home/user/Coach-PTapp");
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const OUT = "briefs/reports/step9-polish";
const ID = { henna: "5b757e16-813a-46f6-be67-423ff3b093cc", juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee" };
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const NOW = new Date(2026, 9, 5, 12, 0, 0); // Mon 5 Oct 2026, local

const programs = read("programs.json");
const henna = programs.find((r) => r.id === "henna-2026-10");
const FUTURE = { ...henna, id: "henna-2026-11", name: "Henna — November 2026 (mock)", effective_from: "2026-11-02" };
const TOMORROW = { ...henna, id: "henna-2026-10-06", name: "Henna — tomorrow (mock)", effective_from: "2026-10-06" };
const TODAYROW = { ...henna, id: "henna-2026-10-05", name: "Henna — today (mock)", effective_from: "2026-10-05" };
const roster = [{ id: ID.henna, name: "Henna", isSelf: true, state: "ok" }, { id: ID.juha, name: "Juha", isSelf: false, state: "ok" }];
const data = { ok: true, me: ID.henna, roster,
  logs: { [ID.henna]: rows(read("logs-henna.json")), [ID.juha]: rows(read("logs-juha.json")) }, overrides: {},
  programs: [...programs, TODAYROW, TOMORROW, FUTURE], wearables: { connections: [], days: {}, workouts: {} } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coach-polish-"));
const realData = path.resolve("src/core/data.js");
const stubs = {
  // getClient: a fake that records the chain and "deletes" the row from the next loadAll.
  "supabase.js": `export const isConfigured=()=>true;export const currentUser=async()=>({id:${JSON.stringify(ID.henna)},email:"coach@example.com"});export const onAuthChange=()=>()=>{};export const sendMagicLink=async()=>({ok:true});export const signOut=async()=>{};
    export const getClient=()=>{const calls=(window.__calls=window.__calls||[]);let id=null;const q={delete(){calls.push(["delete"]);return q;},eq(c,v){calls.push(["eq",c,v]);if(c==="id")id=v;return q;},gt(c,v){calls.push(["gt",c,v]);return q;},select(s){calls.push(["select",s]);window.__deleted=(window.__deleted||[]).concat(id);return Promise.resolve({data:[{id,effective_from:"x"}],error:null});}};return {from(t){calls.push(["from",t]);return q;}};};`,
  "data.js": `const DATA=${JSON.stringify(data)};
    export const loadAll=async()=>{window.__loads=(window.__loads||0)+1;const gone=window.__deleted||[];return {...DATA,programs:DATA.programs.filter(r=>!gone.includes(r.id))};};
    export const insertProgramVersion=async()=>({ok:false,error:"stub"});
    export { deleteFutureVersion, canDeleteVersion } from ${JSON.stringify(realData)};`,
};
await esbuild.build({
  stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import App from "./src/app.jsx";createRoot(document.getElementById("root")).render(React.createElement(App));`, resolveDir: process.cwd(), loader: "jsx" },
  bundle: true, outfile: path.join(tmp, "bundle.js"), loader: { ".jsx": "jsx" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /core\/(supabase|data)\.js$/ }, (a) => {
      if (a.importer === "data.js" && a.path === realData) return undefined; // the stub re-exports the real file
      return { path: a.path.split("/").pop(), namespace: "stub" };
    });
    b.onResolve({ filter: /\/supabase\.js$/ }, () => ({ path: "supabase.js", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js", resolveDir: process.cwd() }));
  } }],
});
fs.copyFileSync("styles.css", path.join(tmp, "styles.css"));
fs.writeFileSync(path.join(tmp, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);

const results = [];
const check = (n, fn) => { try { fn(); results.push(["ok", n]); } catch (e) { results.push(["FAIL", n + " — " + e.message.split("\n")[0]]); } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
await page.route(/^https?:\/\//, (r) => r.abort());
await page.clock.install({ time: NOW });
await page.goto(`file://${tmp}/index.html#/${ID.henna}/versions`);
await page.reload();
await page.waitForSelector("table");
await page.waitForTimeout(500);

const rowOf = (id) => page.locator("tr", { has: page.locator("td", { hasText: new RegExp("^" + id + "$") }) });
const hasDelete = async (id) => (await rowOf(id).locator('[data-action="delete-version"]').count()) === 1;

check("the Versions tab lists the mocked future version", async () => {});
assert.equal(await rowOf("henna-2026-11").count(), 1);
const offered = await page.locator('[data-action="delete-version"]').count();
check("Delete version is offered on exactly the two future rows (tomorrow, November)", () => assert.equal(offered, 2));
check("offered on henna-2026-11 (effective 2026-11-02)", async () => {});
assert.ok(await hasDelete("henna-2026-11"));
check("offered on a version effective tomorrow", async () => {});
assert.ok(await hasDelete("henna-2026-10-06"));
const inForceRow = await rowOf("henna-2026-10-05").innerText();
check("the version effective today is the one in force", () => assert.match(inForceRow, /in force/));
check("not offered on the in-force version (effective today)", async () => {});
assert.ok(!(await hasDelete("henna-2026-10-05")));
check("not offered on past versions", async () => {});
assert.ok(!(await hasDelete("henna-2026-10")) && !(await hasDelete("henna-2026-09")));
await page.screenshot({ path: `${OUT}/coach-1-versions-delete-offered.png`, fullPage: true });

await rowOf("henna-2026-11").locator('[data-action="delete-version"]').click();
await page.waitForTimeout(200);
const confirmText = await page.locator('[data-part="delete-confirm"]').innerText();
check("the confirm names the id and the date", () => { assert.match(confirmText, /henna-2026-11/); assert.match(confirmText, /2026-11-02/); });
check("nothing is sent before Confirm", async () => {});
assert.equal(await page.evaluate(() => (window.__calls || []).length), 0);
await page.screenshot({ path: `${OUT}/coach-2-delete-confirm.png`, fullPage: true });

const loadsBefore = await page.evaluate(() => window.__loads || 0);
await page.locator('[data-action="delete-confirm"]').click();
await page.waitForTimeout(800);
const calls = await page.evaluate(() => window.__calls);
check("Confirm sends the guarded delete: programs, id, effective_from > today", () => assert.deepEqual(calls, [
  ["from", "programs"], ["delete"], ["eq", "id", "henna-2026-11"], ["gt", "effective_from", "2026-10-05"], ["select", "id, effective_from"],
]));
const loadsAfter = await page.evaluate(() => window.__loads || 0);
check("the version list is reloaded after the delete", () => assert.ok(loadsAfter > loadsBefore, `${loadsBefore} → ${loadsAfter}`));
check("the deleted row is gone from the table", async () => {});
assert.equal(await rowOf("henna-2026-11").count(), 0);
await page.screenshot({ path: `${OUT}/coach-3-after-delete.png`, fullPage: true });

check("no page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const [s, n] of results) console.log(s === "ok" ? "  ok  " : "  FAIL", n);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\nstep9-polish coach browser check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
