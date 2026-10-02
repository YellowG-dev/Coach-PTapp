import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
process.chdir("/home/user/Coach-PTapp");
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const OUT = "briefs/reports/step9-phase6-standard-slots";
const ID = { henna: "5b757e16-813a-46f6-be67-423ff3b093cc", juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee", joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d", ville: "2a545525-d9a4-450c-b90b-ce04d8f48abe" };
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const NOW = new Date(2026, 9, 2, 12, 0, 0);
const roster = [{ id: ID.henna, name: "Henna", isSelf: true, state: "ok" }, { id: ID.juha, name: "Juha", isSelf: false, state: "ok" }];
const data = { ok: true, me: ID.henna, roster,
  logs: { [ID.henna]: rows(read("logs-henna.json")), [ID.juha]: rows(read("logs-juha.json")) }, overrides: {},
  programs: read("programs.json"), wearables: { connections: [], days: {}, workouts: {} } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coach-p6-"));
const stubs = {
  "supabase.js": `export const isConfigured=()=>true;export const currentUser=async()=>({id:${JSON.stringify(ID.henna)},email:"coach@example.com"});export const onAuthChange=()=>()=>{};export const sendMagicLink=async()=>({ok:true});export const signOut=async()=>{};export const getClient=()=>null;`,
  "data.js": `export const loadAll=async()=>(${JSON.stringify(data)});export const insertProgramVersion=async()=>({ok:false,error:"stub"});`,
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
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
await page.route(/^https?:\/\//, (r) => r.abort());
await page.clock.install({ time: NOW });
await page.goto(`file://${tmp}/index.html#/${ID.henna}/programme`);
await page.reload();
await page.waitForSelector('[data-part="library"]');
await page.waitForTimeout(500);

const library = page.locator('[data-part="library"]');
const slotsBefore = await library.locator("div.mt-3 > div.flex.items-center.gap-2 > p").allTextContents();
check("Henna's library starts with Strength and Yoga only", () => assert.deepEqual(slotsBefore.filter((t) => ["Strength", "Yoga", "Walk"].includes(t)), ["Strength", "Yoga"], JSON.stringify(slotsBefore)));

// 1. add the standard Walk slot
const picker = page.locator('[data-part="add-slot"] select');
const options = await picker.locator("option").allTextContents();
check("the Add slot picker lists the standard slots Henna lacks, plus Custom slot…", () => assert.deepEqual(options, ["Choose a slot…", "Run", "Walk", "Swim", "Bike", "Cardio", "Custom slot…"]));
await picker.selectOption({ label: "Walk" });
await page.waitForTimeout(300);
check("Walk appears in the library with its catalogue colour", async () => {});
const walkGroup = library.locator("div.mt-3", { has: page.locator("p", { hasText: /^Walk$/ }) });
assert.equal(await walkGroup.count(), 1);
const swatch = await walkGroup.locator("span[aria-hidden]").first().evaluate((e) => getComputedStyle(e).backgroundColor);
check("the Walk swatch is #C9D46B", () => assert.equal(swatch, "rgb(201, 212, 107)"));
const after = await picker.locator("option").allTextContents();
check("Walk is no longer offered once added", () => assert.ok(!after.includes("Walk")));

// 2. add a block
await walkGroup.getByRole("button", { name: "+ Add block" }).click();
await page.getByLabel("New block label").fill("Easy walk");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.waitForTimeout(300);
const card = library.locator('[data-card="library"]', { hasText: "Easy walk" });
check("the new block shows in the library under Walk", async () => {});
assert.equal(await card.count(), 1);

// 3. place on Tue and Thu (drag from the library to the week board)
for (const dow of ["2", "4"]) {
  await card.first().dragTo(page.locator(`[data-part="board"] [data-part="day"][data-dow="${dow}"]`).first());
  await page.waitForTimeout(300);
}
const placed = await page.locator('[data-part="board"] [data-card="day"]', { hasText: "Easy walk" }).count();
check("Easy walk is on the board on Tue and Thu (Week A)", () => assert.equal(placed, 2));
await page.screenshot({ path: `${OUT}/coach-1-walk-slot-block-placed.png`, fullPage: true });

// 4. Check passes
const checkBtn = page.locator('[data-part="publish"]').getByRole("button", { name: "Check", exact: true });
check("Check is enabled once there are changes", async () => {});
assert.equal(await checkBtn.isDisabled(), false);
await checkBtn.click();
await page.waitForTimeout(600);
const publishText = await page.locator('[data-part="publish"]').innerText();
check("Check passes: the Publish button is offered and nothing is blocking", () => assert.ok(await_publish(publishText), publishText.slice(0, 300)));
function await_publish(t) { return /Publish/.test(t) && !/✕/.test(t); }
const changes = await page.locator('[data-part="publish"] ul li').allTextContents();
check("the change list names the new slot, the block and the placements", () => assert.ok(changes.length >= 3, changes.join(" | ")));
await page.screenshot({ path: `${OUT}/coach-2-check-passes.png`, fullPage: true });

// 5. cardio types
await page.locator('[data-part="section"] summary', { hasText: "Cardio types" }).click();
await page.getByRole("button", { name: "Use standard cardio types" }).click();
await page.waitForTimeout(300);
const typeIds = await page.locator('[data-part="publish"] p.font-mono, [data-part="publish"] p[style*="monospace"]').allTextContents();
const sportsPickers = await page.locator('[data-part="sports"]').count();
check("Use standard cardio types fills Run, Walk, Swim, Bike and Cardio (5 sports pickers)", () => assert.equal(sportsPickers, 5));
const slotSelects = await page.locator('[data-part="publish"] select').evaluateAll((sels) => sels.filter((s) => [...s.options].some((o) => /extras only/.test(o.textContent))).map((s) => ({ value: s.value, options: [...s.options].map((o) => o.textContent) })));
check("each Slot dropdown lists only cardio slots (never strength or yoga) and the types are linked: Walk → walk, others extras-only", () => {
  assert.equal(slotSelects.length, 5);
  for (const s of slotSelects) assert.deepEqual(s.options, ["— extras only", "walk"]);
  assert.deepEqual(slotSelects.map((s) => s.value), ["", "walk", "", "", ""]);
});
// custom code warning / error
const first = page.locator('[data-part="sports"]').first();
await first.getByLabel("Custom code").fill("Assault bike");
await page.waitForTimeout(150);
const warn = await first.locator('[data-part="sport-problem"]').innerText();
check("a custom code that is not a known sport shows the validator's warning", () => assert.match(warn, /not a known watch-sport code/));
await first.getByLabel("Custom code").fill("yoga");
await page.waitForTimeout(150);
const err = await first.locator('[data-part="sport-problem"]').innerText();
check("a yoga / strength code shows the validator's error and cannot be added", async () => {});
assert.match(err, /not cardio/);
assert.equal(await first.getByRole("button", { name: "Add code" }).isDisabled(), true);
await first.getByLabel("Custom code").fill("Assault bike");
await first.getByRole("button", { name: "Add code" }).click();
await page.waitForTimeout(200);
check("an unknown code can still be added (a warning, not a block); its chip is flagged", async () => {});
assert.match(await page.locator('[data-part="sports"]').first().innerText(), /Assault bike ⚠/);
const strengthYogaChips = await page.locator('[data-part="sports"]').first().getByRole("button", { name: /^(yoga|strengthTraining)$/ }).count();
check("the sport choices do not offer yoga or strengthTraining", () => assert.equal(strengthYogaChips, 0));
await checkBtn.click();
await page.waitForTimeout(600);
check("Check still passes with the unknown code (warning only)", async () => {});
assert.ok(await_publish(await page.locator('[data-part="publish"]').innerText()));
await page.screenshot({ path: `${OUT}/coach-3-cardio-types.png`, fullPage: true });

// 6. cardio target panel only for cardio slots
await library.locator('[data-card="library"]', { hasText: "Easy walk" }).first().click();
await page.waitForTimeout(300);
check("a Walk block shows the Cardio target panel", async () => {});
assert.ok((await page.locator('[data-part="block"]').innerText()).includes("Cardio target"));
await library.locator('[data-card="library"]').filter({ hasText: /Session|Day|Upper|Lower/ }).first().click();
await page.waitForTimeout(300);
const strengthPanel = await page.locator('[data-part="block"]').innerText();
check("a strength block shows no Cardio target panel", () => assert.ok(!strengthPanel.includes("Cardio target")));

check("no page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const [s, n] of results) console.log(s === "ok" ? "  ok  " : "  FAIL", n);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\nphase 6 coach browser check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
