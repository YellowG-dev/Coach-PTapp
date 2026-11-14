// Step 10 Phase 1 — Coach browser check (headless Chromium).
// Run: node briefs/reports/step10-phase1/coach-browser-check.mjs  (any cwd)
//
// Ville's fixture programme (ville-2026-10) in the real Coach editor, bundled
// with Supabase stubbed out (same method as the Phase 6 check). Add the
// standard Ski slot; the three template blocks must show under Ski; Check must
// pass. Also: "Use standard cardio types" offers a Ski type linked to the slot.
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import assert from "node:assert/strict";
process.chdir("/home/user/Coach-PTapp");
const esbuild = await import("/home/user/Coach-PTapp/node_modules/esbuild/lib/main.js");
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const OUT = "briefs/reports/step10-phase1";
const ID = { ville: "2a545525-d9a4-450c-b90b-ce04d8f48abe", juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee" };
const NOW = new Date(2026, 9, 5, 12, 0, 0); // ville-2026-10 is in force
const programs = JSON.parse(fs.readFileSync("./fixtures/programs.json", "utf8"));
const roster = [{ id: ID.juha, name: "Juha", isSelf: true, state: "ok" }, { id: ID.ville, name: "Ville", isSelf: false, state: "ok" }];
const data = { ok: true, me: ID.juha, roster, logs: { [ID.juha]: [], [ID.ville]: [] }, overrides: {},
  programs, wearables: { connections: [], days: {}, workouts: {} } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coach-s10-"));
const stubs = {
  "supabase.js": `export const isConfigured=()=>true;export const currentUser=async()=>({id:${JSON.stringify(ID.juha)},email:"coach@example.com"});export const onAuthChange=()=>()=>{};export const sendMagicLink=async()=>({ok:true});export const signOut=async()=>{};export const getClient=()=>null;`,
  "data.js": `export const loadAll=async()=>(${JSON.stringify(data)});export const insertProgramVersion=async()=>({ok:false,error:"stub"});export const canDeleteVersion=()=>false;export const deleteFutureVersion=async()=>({ok:false,error:"stub"});`,
};
await esbuild.build({
  stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import App from "./src/app.jsx";createRoot(document.getElementById("root")).render(React.createElement(App));`, resolveDir: process.cwd(), loader: "jsx" },
  bundle: true, outfile: path.join(tmp, "bundle.js"), loader: { ".jsx": "jsx" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /core\/(supabase|data)\.js$/ }, (a) => ({ path: a.path.split("/").pop(), namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
  } }],
});
fs.copyFileSync("styles.css", path.join(tmp, "styles.css"));
fs.writeFileSync(path.join(tmp, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);

const results = [];
const check = (n, fn) => { try { fn(); results.push(["ok", n]); } catch (e) { results.push(["FAIL", n + " — " + e.message.split("\n")[0]]); } };
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
await page.route(/^https?:\/\//, (r) => r.abort());
await page.clock.install({ time: NOW });
await page.goto(`file://${tmp}/index.html#/${ID.ville}/programme`);
await page.reload();
await page.waitForSelector('[data-part="library"]');
await page.waitForTimeout(500);

const library = page.locator('[data-part="library"]');
const picker = page.locator('[data-part="add-slot"] select');
const options = await picker.locator("option").allTextContents();
check("the Add slot picker offers Ski (Ville lacks walk, swim, cardio, ski)", () =>
  assert.deepEqual(options, ["Choose a slot…", "Walk", "Swim", "Cardio", "Ski", "Custom slot…"]));
await picker.selectOption({ label: "Ski" });
await page.waitForTimeout(400);

const skiGroup = library.locator("div.mt-3", { has: page.locator("p", { hasText: /^Ski$/ }) });
const groupCount = await skiGroup.count();
check("Ski appears in the library", () => assert.equal(groupCount, 1));
const swatch = groupCount ? await skiGroup.locator("span[aria-hidden]").first().evaluate((e) => getComputedStyle(e).backgroundColor) : null;
check("the Ski swatch is #B5DDF2", () => assert.equal(swatch, "rgb(181, 221, 242)"));
const cards = groupCount ? await skiGroup.locator('[data-card="library"]').allInnerTexts() : [];
check("the three template blocks show under Ski: XC-Classic, XC-Skate, Downhill", () => {
  assert.equal(cards.length, 3, JSON.stringify(cards));
  ["XC-Classic", "XC-Skate", "Downhill"].forEach((l, i) => assert.match(cards[i], new RegExp(l)));
});
const after = await picker.locator("option").allTextContents();
check("Ski is no longer offered once added", () => assert.ok(!after.includes("Ski")));

// Open one block: its exercises and the cardio result fields are there.
await skiGroup.locator('[data-card="library"]', { hasText: "Downhill" }).first().click();
await page.waitForTimeout(400);
// Exercise names are editable, so they sit in <input> values, not in innerText.
const blockText = await page.locator('[data-part="block"]').evaluate((el) =>
  el.innerText + "\n" + [...el.querySelectorAll("input")].map((i) => i.value).join("\n"));
check("the Downhill block lists the session task and the four result fields", () => {
  for (const t of ["Downhill skiing", "Distance", "Duration", "Average heart rate", "Max heart rate"]) assert.ok(blockText.includes(t), t);
});
check("a Ski block shows the Cardio target panel (Ski counts as cardio)", () => assert.ok(blockText.includes("Cardio target")));
await page.screenshot({ path: `${OUT}/coach-1-ski-slot-added.png`, fullPage: true });

// Check passes
const checkBtn = page.locator('[data-part="publish"]').getByRole("button", { name: "Check", exact: true });
const disabled = await checkBtn.isDisabled();
check("Check is enabled once there are changes", () => assert.equal(disabled, false));
await checkBtn.click();
await page.waitForTimeout(600);
const publishText = await page.locator('[data-part="publish"]').innerText();
check("Check passes: Publish is offered and nothing is blocking", () => assert.ok(/Publish/.test(publishText) && !/✕/.test(publishText), publishText.slice(0, 400)));
const changes = await page.locator('[data-part="publish"] ul li').allTextContents();
check("the change list names the new slot and its blocks", () => assert.ok(changes.some((c) => /ski|Ski/.test(c)), changes.join(" | ")));
await page.screenshot({ path: `${OUT}/coach-2-check-passes.png`, fullPage: true });

// Use standard cardio types: a Ski type, linked to the slot
await page.locator('[data-part="section"] summary', { hasText: "Cardio types" }).click();
await page.getByRole("button", { name: "Use standard cardio types" }).click();
await page.waitForTimeout(300);
const slotSelects = await page.locator('[data-part="publish"] select').evaluateAll((sels) =>
  sels.filter((s) => [...s.options].some((o) => /extras only/.test(o.textContent))).map((s) => s.value));
check("Use standard cardio types adds six types, Ski linked to the ski slot", () => {
  assert.equal(slotSelects.length, 6, JSON.stringify(slotSelects));
  assert.equal(slotSelects[5], "ski");
});
await checkBtn.click();
await page.waitForTimeout(600);
const publish2 = await page.locator('[data-part="publish"]').innerText();
check("Check still passes with the cardio types", () => assert.ok(/Publish/.test(publish2) && !/✕/.test(publish2)));
await page.screenshot({ path: `${OUT}/coach-3-cardio-types-ski.png`, fullPage: true });

check("no page errors", () => assert.deepEqual(errors, []));
await browser.close();
const lines = results.map(([s, n]) => `${s === "ok" ? "ok  " : "FAIL"} ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
lines.push(`\n${results.length - failed} passed, ${failed} failed`);
console.log(lines.join("\n"));
fs.writeFileSync(`${OUT}/coach-browser-check-output.txt`, lines.join("\n") + "\n");
process.exit(failed ? 1 : 0);
