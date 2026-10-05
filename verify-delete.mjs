// Step 9 polish §5 (P4): delete a not-yet-effective programme version.
// Run: node verify-delete.mjs      (node + the repo's esbuild, no network)
//
// deleteFutureVersion must carry the effective_from guard in the query itself,
// so an in-force or past row is refused before the database policy refuses it.
// canDeleteVersion decides whether the Versions tab offers "Delete version".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// data.js reaches config.jsx through supabase.js, which plain node cannot load,
// so it is bundled in memory first with supabase.js stubbed (as verify-browser
// does). Every test passes its own fake client.
const stub = {
  name: "stub-supabase",
  setup(b) {
    b.onResolve({ filter: /\/supabase\.js$/ }, () => ({ path: "supabase.js", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const getClient = () => null;", loader: "js" }));
  },
};
const out = await build({
  entryPoints: ["src/core/data.js"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [stub], logLevel: "error",
});
const { deleteFutureVersion, canDeleteVersion } = await import(
  "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")
);

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e.message).split("\n")[0]}`); }
};

// A fake supabase client that records the chain it is given.
function fakeClient(result) {
  const calls = [];
  const q = {
    delete() { calls.push(["delete"]); return q; },
    eq(c, v) { calls.push(["eq", c, v]); return q; },
    gt(c, v) { calls.push(["gt", c, v]); return q; },
    select(s) { calls.push(["select", s]); return Promise.resolve(result); },
  };
  return { calls, from(t) { calls.push(["from", t]); return q; } };
}

const TODAY = new Date(2026, 9, 5, 12, 0); // 5 Oct 2026, local

console.log("\ncanDeleteVersion (shows 'Delete version')");
await check("today → false", () => assert.equal(canDeleteVersion({ effective_from: "2026-10-05" }, TODAY), false));
await check("yesterday → false", () => assert.equal(canDeleteVersion({ effective_from: "2026-10-04" }, TODAY), false));
await check("a past month → false", () => assert.equal(canDeleteVersion({ effective_from: "2026-09-01" }, TODAY), false));
await check("tomorrow → true", () => assert.equal(canDeleteVersion({ effective_from: "2026-10-06" }, TODAY), true));
await check("-infinity → false", () => assert.equal(canDeleteVersion({ effective_from: "-infinity" }, TODAY), false));
await check("missing or malformed → false", () => {
  assert.equal(canDeleteVersion(null, TODAY), false);
  assert.equal(canDeleteVersion({}, TODAY), false);
  assert.equal(canDeleteVersion({ effective_from: "soon" }, TODAY), false);
});
await check("just after local midnight, today is the new day", () => {
  const t = new Date(2026, 9, 6, 0, 5);
  assert.equal(canDeleteVersion({ effective_from: "2026-10-06" }, t), false);
  assert.equal(canDeleteVersion({ effective_from: "2026-10-07" }, t), true);
});

console.log("\ndeleteFutureVersion (the query)");
await check("builds delete on programs by id with effective_from > today", async () => {
  const c = fakeClient({ data: [{ id: "juha-2026-11", effective_from: "2026-11-02" }], error: null });
  const r = await deleteFutureVersion("juha-2026-11", { client: c, today: TODAY });
  assert.deepEqual(c.calls, [
    ["from", "programs"],
    ["delete"],
    ["eq", "id", "juha-2026-11"],
    ["gt", "effective_from", "2026-10-05"],
    ["select", "id, effective_from"],
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.row.id, "juha-2026-11");
});
await check("no row deleted (in force, past or gone) → ok false with a reason", async () => {
  const c = fakeClient({ data: [], error: null });
  const r = await deleteFutureVersion("juha-2026-10", { client: c, today: TODAY });
  assert.equal(r.ok, false);
  assert.match(r.error, /Nothing deleted/);
});
await check("a database error is passed through, not thrown", async () => {
  const c = fakeClient({ data: null, error: { message: "permission denied" } });
  const r = await deleteFutureVersion("x", { client: c, today: TODAY });
  assert.deepEqual(r, { ok: false, error: "permission denied" });
});
await check("no client (signed out) → Not connected", async () => {
  const r = await deleteFutureVersion("x", { today: TODAY });
  assert.deepEqual(r, { ok: false, error: "Not connected." });
});
await check("no id → refused without a query", async () => {
  const c = fakeClient({ data: [], error: null });
  const r = await deleteFutureVersion("", { client: c, today: TODAY });
  assert.equal(r.ok, false);
  assert.equal(c.calls.length, 0);
});

console.log("\nthe Versions tab");
await check("app.jsx offers Delete version only through canDeleteVersion and calls deleteFutureVersion", () => {
  const src = readFileSync("src/app.jsx", "utf8");
  assert.ok(/\{canDeleteVersion\(r\) && /.test(src));
  assert.ok(/await deleteFutureVersion\(r\.id\)/.test(src));
  assert.ok(/Delete \{r\.id\}, effective \{fromLabel\(r\.effective_from\)\}\?/.test(src));
});

console.log(`\nverify-delete: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
