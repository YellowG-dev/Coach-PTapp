// verify-browser-overview — headless Chromium check of the Overview tab bar and
// the "Recovery vs baseline" card (Coach 0.12.2), and of the Training log week
// view. Run: node verify-browser-overview.mjs   (needs the global `playwright`
// and the pre-installed Chromium; no network, no Supabase). Needs a fresh
// `npm run build` first, because it loads ./styles.css.
//
// Bundles the real CoachApp with core/supabase.js and core/data.js swapped for
// stubs that serve window.__FIX, so one bundle renders every fixture. Writes
// screenshots to briefs/reports/coach-overview-recovery/.

import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { createRequire } from "module";
import { execSync } from "child_process";
import * as esbuild from "esbuild";
import { logs as weekLogs, overrides as weekOv } from "./fixtures/logweek-juha.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const ID = { juha: "1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee", henna: "5b757e16-813a-46f6-be67-423ff3b093cc", joonatan: "47ba0f5b-9844-4a24-81ca-f561a7b2fc9d" };
const read = (p) => JSON.parse(fs.readFileSync("./fixtures/" + p, "utf8"));
const rows = (o) => Object.keys(o).sort().map((day) => ({ day, payload: o[day] }));
const NOW = new Date(2026, 9, 5, 12, 0, 0); // Mon 5 Oct 2026
const key = (n) => { const d = new Date(2026, 9, 5 - n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };

const roster = [
  { id: ID.joonatan, name: "Joonatan", isSelf: true, state: "ok" },
  { id: ID.juha, name: "Juha", isSelf: false, state: "ok" },
  { id: ID.henna, name: "Henna", isSelf: false, state: "ok" },
];
const logs = { [ID.juha]: rows({ ...read("logs-juha.json"), ...weekLogs }), [ID.henna]: rows(read("logs-henna.json")), [ID.joonatan]: rows(read("logs-joonatan.json")) };
const overrides = { [ID.juha]: rows({ ...read("overrides-juha.json"), ...weekOv }), [ID.joonatan]: rows(read("overrides-joonatan.json")) };
const programs = read("programs.json");

// 45 nights for Juha, nights 5 and 6 missing (gaps). `worse` pushes the last 7
// nights the wrong way (HRV down, resting HR up, sleep down); `normal` keeps
// them inside the usual spread.
const wearable = (worse) => {
  const out = [];
  for (let n = 1; n <= 45; n++) {
    if (n === 5 || n === 6) continue;
    const wave = [0, 1, -1, 2, -2, 1, -1][n % 7];
    const last7 = n <= 7;
    out.push({
      user_id: ID.juha, vendor: "oura", day: key(n),
      sleep_minutes: 430 + wave * 12 - (worse && last7 ? 55 : 0),
      readiness: 78 + wave * 3 - (worse && last7 ? 10 : 0),
      resting_hr: 51 + wave - (worse && last7 ? -5 : 0),
      hrv: 44 + wave * 3 - (worse && last7 ? 11 : 0),
      steps: 8000,
    });
  }
  return out;
};
const fix = (worse) => ({
  ok: true, me: ID.joonatan, roster, logs, overrides, programs,
  wearables: { connections: [{ user_id: ID.juha, vendor: "oura", status: "connected", last_synced_at: new Date(NOW - 3600e3).toISOString() }], days: { [ID.juha]: wearable(worse) }, workouts: { [ID.juha]: [] } },
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coach-browser-ov-"));
const stubs = {
  "supabase.js": `export const isConfigured=()=>true;export const currentUser=async()=>({id:${JSON.stringify(ID.joonatan)},email:"coach@example.com"});export const onAuthChange=()=>()=>{};export const sendMagicLink=async()=>({ok:true});export const signOut=async()=>{};export const getClient=()=>null;`,
  "data.js": `export const loadAll=async()=>window.__FIX;export const insertProgramVersion=async()=>({ok:false,error:"stub"});export const deleteFutureVersion=async()=>({ok:false,error:"stub"});export const canDeleteVersion=()=>false;`,
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

// minimal PNG reader (8-bit RGB/RGBA, non-interlaced) to look at real pixels
function pixels(buf) {
  let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); ct = body[9]; }
    if (type === "IDAT") idat.push(body);
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, at: (x, y) => [out[y * stride + x * bpp], out[y * stride + x * bpp + 1], out[y * stride + x * bpp + 2]] };
}
const isAccent = ([r, g, b]) => Math.abs(r - 0xe3) < 12 && Math.abs(g - 0xa2) < 12 && Math.abs(b - 0x3c) < 12; // THEME.accent #E3A23C

const outDir = "briefs/reports/coach-overview-recovery";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let bad = 0;
const fail = (m) => { bad++; console.log("    FAIL " + m); };
const report = {};

for (const [W_, H_] of [[1440, 900], [1280, 800], [390, 844]]) {
  const tag = `${W_}x${H_}`;
  report[tag] = {};
  const ctx = await browser.newContext({ viewport: { width: W_, height: H_ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.clock.install({ time: NOW });
  const go = async (id, tab, worse) => {
    await page.addInitScript((f) => { window.__FIX = f; }, fix(worse));
    await page.goto(`file://${tmp}/index.html#/${id}/${tab}`);
    await page.reload();
    await page.waitForSelector("main");
    await page.waitForTimeout(500);
  };

  // ---- tab bar
  await go(ID.juha, "overview", false);
  const tb = await page.evaluate(() => {
    const row = document.querySelector('[role="tablist"]');
    const act = row.querySelector('[aria-selected="true"]');
    const cs = getComputedStyle(act), r = row.getBoundingClientRect(), a = act.getBoundingClientRect();
    return {
      scrollH: row.scrollHeight, clientH: row.clientHeight, scrollW: row.scrollWidth, clientW: row.clientWidth,
      overflowX: getComputedStyle(row).overflowX, overflowY: getComputedStyle(row).overflowY,
      border: cs.borderBottomWidth, btnBottom: a.bottom, rowBottom: r.bottom, x: a.left + a.width / 2, bottom: a.bottom,
      tabs: [...row.querySelectorAll("button")].map((b) => b.textContent),
    };
  });
  const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W_, height: Math.min(H_, 700) } });
  const png = pixels(shot);
  const cx = Math.round(tb.x);
  const underline = [];
  for (let dy = 0; dy < 5; dy++) underline.push(isAccent(png.at(cx, Math.round(tb.bottom) - 1 - dy)));
  // the underline is the run of accent pixels counted upward from the button's bottom edge
  let run = 0; while (run < 5 && underline[run]) run++;
  report[tag].tabs = { ...tb, underlinePx: run };
  console.log(`  ${tag} tab row: scroll ${tb.scrollW}x${tb.scrollH} / client ${tb.clientW}x${tb.clientH}; overflow ${tb.overflowX}/${tb.overflowY}; underline ${run}px (border ${tb.border}); labels ${tb.tabs.join("|")}`);
  if (tb.scrollH > tb.clientH) fail(`tab row scrolls vertically at ${tag}`);
  if (W_ >= 1024 && tb.scrollW > tb.clientW) fail(`tab row scrolls horizontally at ${tag}`);
  if (W_ >= 1024 && (tb.overflowX !== "visible" || tb.overflowY !== "visible")) fail(`desktop tab row is still a scroll container at ${tag}`);
  if (run !== 2) fail(`active tab underline is ${run}px, not 2px, at ${tag}`);
  if (tb.tabs.join("|") !== "Overview|Training log|Progress|Programme|Versions") fail("tab labels or order changed");
  if (W_ < 1024) {
    const sc = await page.evaluate(() => { const row = document.querySelector('[role="tablist"]'); row.scrollLeft = 9999; return { moved: row.scrollLeft, over: row.scrollWidth > row.clientWidth }; });
    console.log(`  ${tag} tab row horizontal scroll: tabs overflow ${sc.over}, scrolled ${sc.moved}px`);
    if (sc.over && sc.moved === 0) fail("phone tab row does not scroll horizontally");
  }

  // ---- recovery card (desktop widths)
  if (W_ >= 1024) {
    for (const [name, worse] of [["normal", false], ["worse", true]]) {
      await go(ID.juha, "overview", worse);
      const m = await page.evaluate(() => {
        const card = [...document.querySelectorAll("main section")].find((s) => /Recovery vs baseline/.test(s.textContent) && s.querySelector("h3"));
        const svgs = [...card.querySelectorAll("svg")];
        return {
          title: card.querySelector("h3").textContent, verdict: card.querySelector("p").textContent, svgs: svgs.length,
          bands: svgs.filter((s) => s.querySelector("rect")).length,
          solid: svgs.filter((s) => [...s.querySelectorAll("path")].some((p) => p.getAttribute("stroke-width") === "2")).length,
          dots: card.querySelectorAll("[data-dot]").length, better: card.querySelectorAll('[data-dot="better"]').length, worse: card.querySelectorAll('[data-dot="worse"]').length,
          aria: svgs.map((s) => s.getAttribute("aria-label")), text: card.innerText.replace(/\n+/g, " | "),
          box: (() => { const r = card.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height }; })(),
          pageScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        };
      });
      report[tag]["recovery " + name] = m;
      console.log(`  ${tag} recovery (${name}): "${m.verdict}" · ${m.svgs} svgs, ${m.bands} bands, ${m.solid} solid, dots ${m.dots} (${m.better} better / ${m.worse} worse)`);
      console.log(`      ${m.text}`);
      if (m.title !== "Recovery vs baseline") fail("card title");
      if (m.svgs !== 4 || m.bands !== 4 || m.solid !== 4) fail(`expected 4 svgs with band and solid last-7 line (${name})`);
      if (m.dots < 1) fail(`no out-of-range dots (${name})`);
      if (m.aria.some((a) => !/better|worse|normal|building/.test(a))) fail("aria-label missing status: " + m.aria.join(" / "));
      if (name === "normal" && /^Below normal/.test(m.verdict)) fail("normal fixture reads below normal");
      if (name === "worse" && !/^Below normal this week: .*(HRV|Resting HR)/.test(m.verdict)) fail("worse fixture verdict: " + m.verdict);
      if (/NaN|undefined/.test(m.text)) fail("NaN/undefined in the card");
      if (m.pageScroll > m.innerWidth) fail("page scrolls horizontally");
      if (W_ === 1440) await page.screenshot({ path: `${outDir}/recovery-${name}-1440.png`, clip: { x: Math.max(0, m.box.x - 8), y: m.box.y - 8, width: m.box.w + 16, height: m.box.h + 16 }, fullPage: true });
    }
  }
  if (W_ === 1440) { await go(ID.juha, "overview", true); await page.screenshot({ path: `${outDir}/overview-worse-1440.png`, fullPage: true }); }
  if (W_ === 390) { await go(ID.juha, "overview", true); await page.screenshot({ path: `${outDir}/overview-390.png`, clip: { x: 0, y: 0, width: 390, height: 520 } }); }

  if (errors.length) fail("page errors at " + tag + ": " + errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ---- Training log: week grid + day card. Clock set to Sun 4 Oct 2026 evening, so the
// current week is Mon 28 Sep – Sun 4 Oct (the hand-made week) and today has a log row.
const NOW_LOG = new Date(2026, 9, 4, 20, 0, 0);
for (const [W_, H_] of [[1440, 900], [390, 844]]) {
  const tag = `${W_}x${H_}`;
  report[tag] = report[tag] || {};
  const ctx = await browser.newContext({ viewport: { width: W_, height: H_ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.clock.install({ time: NOW_LOG });
  await page.addInitScript((f) => { window.__FIX = f; }, fix(false));
  await page.goto(`file://${tmp}/index.html#/${ID.juha}/log`);
  await page.reload();
  await page.waitForSelector('[data-part="week-grid"]');
  await page.waitForTimeout(400);

  const read1 = () => page.evaluate(() => {
    const grid = document.querySelector('[data-part="week-grid"]');
    const cols = [...grid.querySelectorAll("button[data-day]")];
    const card = document.querySelector('[data-part="day-card"]');
    const sel = cols.find((c) => c.getAttribute("aria-pressed") === "true");
    const cell = (day, n) => { const c = cols.find((x) => x.dataset.day === day); return c ? getComputedStyle(c.children[n]).backgroundColor : null; };
    return {
      title: document.querySelector('[data-part="week-title"]').textContent,
      cols: cols.length, selected: sel ? sel.dataset.day : null,
      cardDay: card ? card.dataset.day : null, cardTitle: card ? card.querySelector("h3").lastChild.textContent.trim() : null,
      rows: card ? card.querySelectorAll('[role="row"]').length - 1 : 0, hasResults: card ? !!card.querySelector('[data-part="results"]') : false,
      gridScroll: { sw: grid.scrollWidth, cw: grid.clientWidth, overflowX: getComputedStyle(grid).overflowX },
      pageScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
      empty: /Nothing was logged this week/.test(document.querySelector('[data-part="log-week"]').textContent),
      prevDisabled: document.querySelector('[aria-label="Previous week"]').disabled, nextDisabled: document.querySelector('[aria-label="Next week"]').disabled,
      adherenceLine: !!document.querySelector('[data-part="adherence-compact"]'), oldList: /Show earlier days/.test(document.body.textContent),
      // cell backgrounds: on = doneBg #1F2A24, off = warnBg #2E2029, neutral/none = panel #151922  (rows: 0 header, 1 session, 2 exercises, 3 sets, 4 mobility, 5 kcal, 6 protein, 7 weigh, 8 knee/alc)
      monKcal: cell("2026-09-28", 5), wedKcal: cell("2026-09-30", 5), friAlc: cell("2026-10-02", 8), thuEx: cell("2026-10-01", 2), tueEx: cell("2026-09-29", 2), sunSess: cell("2026-10-04", 1),
      selOutline: sel ? getComputedStyle(sel).boxShadow : null,
      selHeader: sel ? getComputedStyle(sel.children[0]).borderBottomWidth + " " + getComputedStyle(sel.children[0]).borderBottomColor : null,
    };
  });
  const a = await read1();
  report[tag].log = a;
  console.log(`  ${tag} log: "${a.title}" · ${a.cols} columns · selected ${a.selected} · card "${a.cardTitle}" (${a.cardDay}) · grid ${a.gridScroll.sw}/${a.gridScroll.cw} (${a.gridScroll.overflowX}) · page ${a.pageScroll}/${a.innerWidth}`);
  if (a.title !== "Week 28 Sep – 4 Oct") fail("default week is not the current week: " + a.title);
  if (a.cols !== 7) fail("expected 7 day columns");
  if (a.selected !== "2026-10-04" || a.cardDay !== "2026-10-04") fail("default selection should be today, Sun 4 Oct");
  if (a.cardTitle !== "Cleared — travel") fail("Sun card title: " + a.cardTitle);
  if (!a.adherenceLine || a.oldList) fail("compact adherence line missing or the old paged list is still there");
  if (a.pageScroll > a.innerWidth) fail("log page scrolls horizontally at " + tag);
  if (a.monKcal !== "rgb(31, 42, 36)" || a.wedKcal !== "rgb(46, 32, 41)" || a.friAlc !== "rgb(46, 32, 41)" || a.thuEx !== "rgb(31, 42, 36)" || a.tueEx !== "rgb(21, 25, 34)" || a.sunSess !== "rgb(46, 32, 41)") fail("cell colours: " + JSON.stringify([a.monKcal, a.wedKcal, a.friAlc, a.thuEx, a.tueEx, a.sunSess]));
  if (!/2px/.test(a.selHeader) || !/inset/.test(a.selOutline || "")) fail("selected column lacks the accent underline / outline: " + a.selHeader + " / " + a.selOutline);
  if (W_ === 1440) {
    if (a.gridScroll.sw > a.gridScroll.cw) fail("week grid scrolls at 1440");
  } else {
    if (!(a.gridScroll.sw > a.gridScroll.cw) || a.gridScroll.overflowX !== "auto") fail("grid should scroll sideways in its own box at 390");
    const st = await page.evaluate(() => { const g = document.querySelector('[data-part="week-grid"]'); g.scrollLeft = 9999; return g.scrollLeft; });
    if (!st) fail("grid did not scroll at 390");
  }
  await page.screenshot({ path: `${outDir}/training-log-${W_}.png`, fullPage: true });

  // click another day: Saturday (Session C, Zone 2 cleared)
  await page.click('button[data-day="2026-10-03"]');
  await page.waitForTimeout(150);
  const b = await read1();
  const sat = await page.evaluate(() => { const c = document.querySelector('[data-part="day-card"]'); return { text: c.innerText.replace(/\n+/g, " | "), pills: c.querySelectorAll('[role="cell"] span').length }; });
  console.log(`  ${tag} click Sat: selected ${b.selected} · card "${b.cardTitle}" · ${b.rows} exercise rows · ${b.hasResults ? "results strip" : "no strip"}`);
  if (b.selected !== "2026-10-03" || b.cardDay !== "2026-10-03") fail("clicking Sat did not select it");
  if (b.cardTitle !== "Session C — Shoulders / Posterior Chain") fail("Sat card title: " + b.cardTitle);
  if (b.rows !== 8 || !b.hasResults) fail("Sat card should have 8 exercise rows and the results strip: " + b.rows);
  if (!/Zone 2 cleared/.test(sat.text) || !/8 of 11 exercises logged/.test(sat.text) || !/first log/.test(sat.text) || !/▲ \+5 kg/.test(sat.text)) fail("Sat card text: " + sat.text.slice(0, 600));
  if (/dismissedWorkouts|oura:|cardio cleared|\bup-\d|\blo-\d|\bmob-\d/.test(sat.text)) fail("internal key in the card: " + sat.text);
  await page.screenshot({ path: `${outDir}/training-log-sat-${W_}.png`, fullPage: true });

  // keyboard: Tab-focus the Thursday column and press Enter (a real <button>)
  await page.focus('button[data-day="2026-10-01"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const k = await read1();
  if (k.selected !== "2026-10-01" || !/Session B/.test(k.cardTitle)) fail("keyboard selection of Thu failed: " + k.cardTitle);
  const thu = await page.evaluate(() => document.querySelector('[data-part="day-card"]').innerText);
  if (!/Cable curl\s*for Ez-bar curl/.test(thu.replace(/\n+/g, " "))) fail("substitution should read 'Cable curl for Ez-bar curl'");

  // weeks: next is disabled in the current week; ‹ moves back
  if (!a.nextDisabled) fail("next week should be disabled in the current week");
  await page.click('[aria-label="Previous week"]');
  await page.waitForTimeout(150);
  const w1 = await read1();
  console.log(`  ${tag} ‹ : "${w1.title}" · selected ${w1.selected} · card ${w1.cardDay} · empty ${w1.empty}`);
  if (w1.title !== "Week 21 Sep – 27 Sep") fail("‹ should show Week 21 Sep – 27 Sep, got " + w1.title);
  if (!w1.empty || w1.cols !== 7) fail("an empty week should say so and still show 7 columns");
  await page.click('[aria-label="Previous week"]');
  await page.waitForTimeout(150);
  const w2 = await read1();
  console.log(`  ${tag} ‹‹: "${w2.title}" · selected ${w2.selected} · card "${w2.cardTitle}"`);
  if (w2.title !== "Week 14 Sep – 20 Sep" || w2.empty || !w2.cardDay) fail("two weeks back should be Week 14 Sep – 20 Sep with a card: " + w2.title);
  await page.click('[aria-label="Next week"]');
  await page.click('[aria-label="Next week"]');
  await page.waitForTimeout(150);
  const w3 = await read1();
  if (w3.title !== "Week 28 Sep – 4 Oct" || !w3.nextDisabled || w3.selected !== "2026-10-04") fail("› › should return to this week with Sunday selected: " + w3.title);
  if (errors.length) fail("page errors at " + tag + ": " + errors.slice(0, 3).join(" | "));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(report, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} browser check(s) failed` : "\nAll overview browser checks passed.");
process.exit(bad ? 1 : 0);
