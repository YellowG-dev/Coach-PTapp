// wearable-connect — called by the client app with the user's JWT.
// Returns the vendor authorize URL carrying a signed, short-lived state.
// Nothing is written here; consent has not happened yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CORS, VENDORS, Vendor, REDIRECT_URI, ANON_KEY, SUPABASE_URL, creds, signState, json } from "./shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ error: "not signed in" }, 401);

    const { vendor } = await req.json().catch(() => ({ vendor: null })) as { vendor: Vendor | null };
    if (!vendor || !(vendor in VENDORS)) return json({ error: "vendor must be 'oura' or 'polar'" }, 400);

    const v = VENDORS[vendor];
    const state = await signState({
      sub: user.id,
      v: vendor,
      exp: Math.floor(Date.now() / 1000) + 600,
      n: crypto.randomUUID(),
    });

    const url = new URL(v.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", creds(vendor).id);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", v.scopes);
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
