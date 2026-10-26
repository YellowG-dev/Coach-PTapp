// wearable-callback — the OAuth redirect target for both vendors.
//
// Runs with verify_jwt = false on purpose: the vendor's browser arrives with no
// session. On iOS this lands in Safari, never in the installed app, so identity
// cannot come from a session here. It comes from the signed state, which is
// checked before anything is written.
//
// The result is shown by redirecting to a static page on the coach site rather
// than returning HTML from here — Chrome displayed the inline version as plain
// text, and GitHub Pages serves HTML correctly without argument.

import { admin, verifyState, tokenRequest, storeTokens, REDIRECT_URI, SUPABASE_URL, SERVICE_KEY, Vendor } from "./shared.ts";

const RETURN_BASE = Deno.env.get("WEARABLE_RETURN_URL") ?? "https://coach.yellowg.fi/connected.html";

function back(status: string, vendor?: string) {
  const url = new URL(RETURN_BASE);
  url.searchParams.set("status", status);
  if (vendor) url.searchParams.set("vendor", vendor);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) return back("denied");
  if (!code || !state) return back("incomplete");

  let sub: string, vendor: Vendor;
  try {
    const payload = await verifyState(state);
    sub = payload.sub;
    vendor = payload.v;
  } catch (_e) {
    return back("expired");
  }

  try {
    const tok = await tokenRequest(vendor, {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });

    await storeTokens(sub, vendor, tok);

    const db = admin();
    const { error } = await db.from("wearable_connections").upsert({
      user_id: sub,
      vendor,
      status: "connected",
      scopes: tok.scope ? tok.scope.split(/[\s,]+/).filter(Boolean) : null,
      connected_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,vendor" });
    if (error) throw new Error(`connection upsert failed: ${error.message}`);

    // Historical backfill, best effort: a failure here must not make a
    // successful connection look broken. wearable-sync records its own errors.
    const backfill = fetch(`${SUPABASE_URL}/functions/v1/wearable-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ user_id: sub, vendor, days: 90 }),
    }).catch(() => {});
    // @ts-ignore EdgeRuntime is present in Supabase's Deno runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(backfill);
    else await backfill;

    return back("ok", vendor);
  } catch (e) {
    try {
      await admin().from("wearable_connections").upsert({
        user_id: sub,
        vendor,
        status: "error",
        last_error: String(e).slice(0, 500),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,vendor" });
    } catch (_) { /* nothing more we can do from here */ }
    return back("failed", vendor);
  }
});
