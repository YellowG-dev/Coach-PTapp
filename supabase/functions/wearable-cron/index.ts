// wearable-cron — syncs every connected wearable. Triggered by pg_cron through
// pg_net, so verify_jwt is off and a fixed key in the body gates it instead.
// It holds the service role key in its own environment; the key never appears
// in a scheduled SQL statement.

// REDACTED IN THIS REPO COPY (26 Oct 2026). The deployed function (version 1)
// has the real key as a string literal on this line; the same key is in the
// body of the pg_cron job `wearable-nightly-sync`. This repo is public, so the
// key is not committed. Everything else in this file is the deployed source,
// verbatim. Do NOT deploy this copy as-is — it would lock the cron out.
const CRON_KEY = "<REDACTED — see cron.job wearable-nightly-sync>";
const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const rest = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  try {
    const { key, days = 7 } = await req.json().catch(() => ({})) as { key?: string; days?: number };
    if (key !== CRON_KEY) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });

    const conns = await fetch(
      `${SB}/rest/v1/wearable_connections?status=in.(connected,error)&select=user_id,vendor`,
      { headers: rest },
    ).then((r) => r.json()) as { user_id: string; vendor: string }[];

    const results: Record<string, unknown>[] = [];
    for (const c of conns) {
      try {
        const res = await fetch(`${SB}/functions/v1/wearable-sync`, {
          method: "POST",
          headers: rest,
          body: JSON.stringify({ user_id: c.user_id, vendor: c.vendor, days }),
        });
        const body = await res.text();
        results.push({ vendor: c.vendor, http: res.status, body: body.slice(0, 200) });
      } catch (e) {
        results.push({ vendor: c.vendor, error: String(e).slice(0, 200) });
      }
    }

    return new Response(JSON.stringify({ ok: true, connections: conns.length, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
