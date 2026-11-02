// verify-browser — headless Chromium check of the laptop layout (Coach redesign R3).
// Run: node verify-browser.mjs        (needs the global `playwright` and the
// pre-installed Chromium; no network, no Supabase)
//
// Bundles the real CoachApp with two modules swapped for fixture-backed stubs
// (core/supabase.js signed-in, core/data.js returning ./fixtures plus synthetic
// wearables), then measures the layout at 1440×900 and 1366×768 and writes
// screenshots to briefs/reports/r3/.

import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { execSync } from "child_process";
import * as esbuild from "esbuild";
import { buildAllAdherence } from "./src/core/adherence.js";
import { buildRecovery } from "./src/core/recovery.js";
import { buildNameMap } from "./src/core/names.js";
import { buildPersonCtx } from "./src/core/overview.js";
import { trackedCards, trendRowsFor } from "./src/core/progress.js";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const ID = { juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee", henna: "5b757e16-813a-46f6-be67-423ff3b093cc", joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d", ville: "2a545525-d9a4-450c-b90b-ce04d8f48abe", kalle: "paused-kalle" };
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const NOW = new Date(2026, 8, 30, 12, 0, 0); // Wed 30 Sep 2026: Ville's programme (from 28 Sep) is in force
const key = (n) => { const d = new Date(2026, 8, 30 - n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };

// ---- fixture data (Ville has a programme but no logs; Joonatan is "you")
const roster = [
  { id: ID.joonatan, name: "Joonatan", isSelf: true, state: "ok" },
  { id: ID.juha, name: "Juha", isSelf: false, state: "ok" },
  { id: ID.henna, name: "Henna", isSelf: false, state: "ok" },
  { id: ID.ville, name: "Ville", isSelf: false, state: "ok" },
  { id: ID.kalle, name: "Kalle", isSelf: false, state: "paused" },
];
const logs = { [ID.juha]: rows(read("logs-juha.json")), [ID.henna]: rows(read("logs-henna.json")), [ID.joonatan]: rows(read("logs-joonatan.json")), [ID.ville]: [], [ID.kalle]: [] };
// a few logged set weights so "Getting stronger" has a line
[[12, 20], [9, 22], [6, 24], [3, 26]].forEach(([n, w]) => {
  const r = logs[ID.juha].find((x) => x.day === key(n));
  const loads = { "db-bench": [{ w, r: 8 }, { w: w - 2, r: 8 }] };
  if (r) r.payload = { ...r.payload, loads }; else logs[ID.juha].push({ day: key(n), payload: { done: {}, loads } });
});
logs[ID.juha].sort((a, b) => (a.day < b.day ? -1 : 1));
const overrides = { [ID.juha]: rows(read("overrides-juha.json")), [ID.joonatan]: rows(read("overrides-joonatan.json")) };
const programs = read("programs.json");
const wdays = [];
for (let n = 1; n <= 45; n++) {
  if (n === 5 || n === 6) continue; // missing nights stay gaps
  wdays.push({ user_id: ID.juha, vendor: "oura", day: key(n), sleep_minutes: 400 + ((n * 7) % 60), readiness: 68 + ((n * 3) % 15), resting_hr: 48 + (n % 5), hrv: 50 + ((n * 5) % 20), steps: 6000 + ((n * 431) % 5000) });
}
const W = (o) => ({ user_id: ID.juha, vendor: "polar", distance_km: null, hr_avg: null, hr_max: null, ...o });
const workouts = [
  W({ day: key(1), sport: "running", started_at: key(1) + "T05:00:00Z", duration_minutes: 48, distance_km: 7.3, hr_avg: 115, hr_max: 126 }),
  W({ day: key(2), sport: "strengthTraining", started_at: key(2) + "T16:00:00Z", duration_minutes: 56, hr_avg: 99, hr_max: 126 }),
  W({ day: key(4), sport: "cycling", started_at: key(4) + "T16:00:00Z", duration_minutes: 70, distance_km: 28 }),
  W({ day: key(8), sport: "running", started_at: key(8) + "T05:00:00Z", duration_minutes: 40, distance_km: 6.5 }),
  W({ day: key(11), sport: "walking", started_at: key(11) + "T05:00:00Z", duration_minutes: 45, distance_km: 3.4 }),
];
const conns = [{ user_id: ID.juha, vendor: "oura", status: "connected", last_synced_at: new Date(NOW - 3600e3).toISOString() }];
const data = { ok: true, me: ID.joonatan, roster, logs, overrides, programs, wearables: { connections: conns, days: { [ID.juha]: wdays }, workouts: { [ID.juha]: workouts } } };

// ---- bundle with stubs
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coach-browser-"));
const stubs = {
  "supabase.js": `export const isConfigured=()=>true;export const currentUser=async()=>({id:${JSON.stringify(ID.joonatan)},email:"coach@example.com"});export const onAuthChange=()=>()=>{};export const sendMagicLink=async()=>({ok:true});export const signOut=async()=>{};export const getClient=()=>null;`,
  "data.js": `export const loadAll=async()=>(${JSON.stringify(data)});export const insertProgramVersion=async()=>({ok:false,error:"stub"});export const deleteFutureVersion=async()=>({ok:false,error:"stub"});export const canDeleteVersion=()=>false;`,
};
const stubPlugin = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /core\/(supabase|data)\.js$/ }, (a) => ({ path: a.path.split("/").pop(), namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
  },
};
await esbuild.build({
  stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import App from "./src/app.jsx";createRoot(document.getElementById("root")).render(React.createElement(App));`, resolveDir: process.cwd(), loader: "jsx" },
  bundle: true, outfile: path.join(tmp, "bundle.js"), loader: { ".jsx": "jsx" }, plugins: [stubPlugin], define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
});
fs.copyFileSync("styles.css", path.join(tmp, "styles.css"));
fs.writeFileSync(path.join(tmp, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);

// expected tracked-card count, from the same pure code the page uses
const expectedTracked = (id) => {
  const p = roster.find((r) => r.id === id);
  const w = data.wearables;
  const ctx = buildPersonCtx(data, p, { today: NOW, recovery: buildRecovery((w.days || {})[id] || [], (w.workouts || {})[id] || [], id), adherence: buildAllAdherence(roster, logs, overrides, programs)[id], names: buildNameMap(programs.filter((r) => r.assigned_to === id).map((r) => ({ definition: r.definition })), overrides[id]) });
  return trackedCards(ctx, trendRowsFor(ctx)).length;
};

// ---- measure
const outDir = "briefs/reports/r3";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let bad = 0;
const fail = (m) => { bad++; console.log("    FAIL " + m); };
const report = {};

for (const [W_, H_] of [[1440, 900], [1366, 768]]) {
  const ctx = await browser.newContext({ viewport: { width: W_, height: H_ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.clock.install({ time: NOW });
  const go = async (id, tab) => {
    await page.goto(`file://${tmp}/index.html#/${id}/${tab}`);
    await page.reload();
    await page.waitForSelector("main");
    await page.waitForTimeout(tab === "recovery" ? 1200 : 400);
  };
  const shot = async (name, height) => { if (W_ === 1440) await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: !height, ...(height ? { clip: { x: 0, y: 0, width: 1440, height } } : {}) }); };
  const tag = `${W_}x${H_}`;
  report[tag] = {};

  // week board, Juha and Ville
  for (const [name, id] of [["Juha", ID.juha], ["Ville", ID.ville]]) {
    await go(id, "programme");
    const m = await page.evaluate(() => {
      const scroller = document.querySelector('[data-part="board"] .overflow-x-auto');
      const cols = [...document.querySelectorAll('[data-part="day"]')];
      const rect = (s) => document.querySelector(s).getBoundingClientRect().width;
      return {
        scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
        pageScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        days: cols.length, dayW: Math.round(cols[0].getBoundingClientRect().width),
        library: Math.round(rect('[data-part="library"]')), publish: Math.round(rect('[data-part="publish"]')), board: Math.round(rect('[data-part="board"]')),
        publishOverflow: (() => { const p = document.querySelector('[data-part="publish"]'); return p.scrollWidth > p.clientWidth; })(),
        boardTop: Math.round(document.querySelector('[data-part="board"]').getBoundingClientRect().top),
      };
    });
    report[tag]["board " + name] = m;
    console.log(`  ${tag} board ${name}: scrollWidth ${m.scrollWidth} / clientWidth ${m.clientWidth}; page ${m.pageScroll}/${m.innerWidth}; day col ${m.dayW}px; library ${m.library}px, board ${m.board}px, publish ${m.publish}px; board top ${m.boardTop}px`);
    if (m.scrollWidth > m.clientWidth) fail(`board scrolls for ${name} at ${tag}`);
    if (m.pageScroll > m.innerWidth) fail(`page scrolls horizontally for ${name} at ${tag}`);
    if (m.days !== 7) fail("expected 7 day columns");
    if (m.publishOverflow) fail(`publish panel content overflows for ${name} at ${tag}`);
    if (name === "Juha") await shot("programme-juha-1440");
  }

  // sidebar
  {
    const sb = await page.evaluate(() => {
      const a = document.querySelector("aside");
      const btns = [...a.querySelectorAll("nav button")].map((b) => b.textContent.trim());
      const so = [...a.querySelectorAll("button")].find((b) => b.textContent.trim() === "Sign out");
      return { width: Math.round(a.getBoundingClientRect().width), btns, signOutTitle: so.getAttribute("title"), text: a.textContent };
    });
    report[tag].sidebar = sb;
    console.log(`  ${tag} sidebar: ${sb.width}px · rows: ${sb.btns.join(" | ")} · sign-out title ${sb.signOutTitle}`);
    if (sb.width >= 200) fail("sidebar not narrower than 200px");
    if (sb.width < 128) fail("sidebar under 128px");
    if (sb.text.includes("coach@example.com")) fail("email still printed in the sidebar");
    if (sb.signOutTitle !== "coach@example.com") fail("email missing from the Sign out tooltip");
    if (/Sept|programme|Block/i.test(sb.btns.join(" "))) fail("programme line still in the sidebar");
    if (!sb.btns.some((t) => /Kalle.*paused/.test(t))) fail("paused marker missing");
  }

  // training log — the R3 day-card measurement retired 5 Oct 2026 (the card was
  // replaced by the week grid + day card); verify-browser-overview.mjs checks
  // the new log in depth. Here only: the tab still renders and the page does
  // not scroll sideways.
  {
    await go(ID.juha, "log");
    const m = await page.evaluate(() => ({ cols: document.querySelectorAll("main button[aria-pressed], main [data-logweek] button").length, text: document.querySelector("main")?.textContent || "", pageScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    report[tag]["log"] = { cols: m.cols, pageScroll: m.pageScroll };
    console.log(`  ${tag} log: ${m.cols} day buttons, page ${m.pageScroll}/${m.innerWidth}`);
    if (m.pageScroll > m.innerWidth) fail("training log scrolls horizontally");
    if (!/Training log|Week/.test(m.text)) fail("training log did not render");
    await shot("training-log-juha-1440", 1300);
  }

  // progress
  {
    await go(ID.juha, "recovery");
    const m = await page.evaluate(() => {
      const rec = [...document.querySelectorAll('[data-chart="recovery"]')];
      return {
        recovery: rec.length, recoveryWithSvg: rec.filter((c) => c.querySelector("svg.recharts-surface")).length,
        tracked: document.querySelectorAll('[data-card="tracked"]').length,
        trackedWithSvg: [...document.querySelectorAll('[data-card="tracked"]')].filter((c) => c.querySelector("svg.recharts-surface")).length,
        stronger: !!document.querySelector('[data-card="stronger"] svg.recharts-surface'), consistency: !!document.querySelector('[data-card="consistency"] svg.recharts-surface'),
        sports: document.querySelectorAll('[data-card="sports"] .rounded-full').length,
        heading: document.querySelector('[data-part="progress"] h2').textContent, tab: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent).join(","),
        pageScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        firstRow: [...document.querySelectorAll('[data-chart="recovery"]')].filter((c) => c.getBoundingClientRect().top === document.querySelector('[data-chart="recovery"]').getBoundingClientRect().top).length,
      };
    });
    const want = expectedTracked(ID.juha);
    report[tag].progress = { ...m, expectedTracked: want };
    console.log(`  ${tag} progress Juha: ${m.recovery} recovery charts (${m.recoveryWithSvg} drawn), ${m.tracked} tracked cards (${m.trackedWithSvg} drawn; expected ${want}), strength ${m.stronger}, consistency ${m.consistency}, sport bars ${m.sports}, cards in first row ${m.firstRow}`);
    if (m.recoveryWithSvg < 4) fail("fewer than 4 recovery charts drawn");
    if (m.tracked !== want || m.trackedWithSvg !== want) fail(`tracked cards ${m.tracked} ≠ expected ${want}`);
    if (!m.stronger || !m.consistency || m.sports < 1) fail("strength / consistency / sports card missing");
    if (m.heading !== "Progress" || !m.tab.includes("Progress") || m.tab.includes("Recovery")) fail("tab/heading not labelled Progress");
    if (m.pageScroll > m.innerWidth) fail("progress scrolls horizontally");
    await shot("progress-juha-1440");

    // a client with no wearable, and the old #/…/recovery link, both open Progress
    await go(ID.henna, "recovery");
    const h = await page.evaluate(() => ({ t: document.querySelector('[data-part="progress"]')?.textContent || "" }));
    if (!/No wearable connected/.test(h.t)) fail("Henna: no-wearable message missing");
  }

  // overview
  {
    await go(ID.juha, "overview");
    const m = await page.evaluate(() => ({ states: [...document.querySelectorAll("[data-day]")].map((d) => d.dataset.state).join(","), dots: document.querySelectorAll("[data-dot]").length }));
    report[tag].overview = m;
    console.log(`  ${tag} overview week states: ${m.states}`);
    await shot("overview-juha-1440");
  }

  if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(report, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} browser check(s) failed` : "\nAll browser checks passed.");
process.exit(bad ? 1 : 0);
