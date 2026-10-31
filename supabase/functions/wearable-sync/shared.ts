// Shared helpers for the wearable sync functions.
// Deployed as a copy inside each function; keep the copies identical.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Vendor = "oura" | "polar";

export const VENDORS = {
  oura: {
    authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    scopes: "daily workout personal",
    basicAuth: false,
  },
  polar: {
    authorizeUrl: "https://auth.polar.com/oauth/authorize",
    tokenUrl: "https://auth.polar.com/oauth/token",
    scopes: "training_sessions:read activity:read sleep:read nightly_recharge:read",
    basicAuth: true,
  },
} as const;

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Must match the redirect URI registered with Oura and Polar, exactly.
export const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/wearable-callback`;

export function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export function creds(vendor: Vendor) {
  const id = Deno.env.get(`${vendor.toUpperCase()}_CLIENT_ID`);
  const secret = Deno.env.get(`${vendor.toUpperCase()}_CLIENT_SECRET`);
  if (!id || !secret) throw new Error(`missing ${vendor} client credentials`);
  return { id, secret };
}

/* ------------------------------- signed state ------------------------------ */

function b64urlEncode(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmacKey() {
  const raw = Deno.env.get("STATE_SIGNING_KEY");
  if (!raw) throw new Error("missing STATE_SIGNING_KEY");
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(body: string) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

export async function signState(payload: Record<string, unknown>) {
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${await sign(body)}`;
}

export async function verifyState(state: string) {
  const [body, mac] = (state || "").split(".");
  if (!body || !mac) throw new Error("malformed state");
  const expected = await sign(body);
  if (mac.length !== expected.length) throw new Error("bad state signature");
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error("bad state signature");
  const payload = JSON.parse(b64urlDecode(body)) as { sub: string; v: Vendor; exp: number };
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("state expired");
  return payload;
}

/* ------------------------------ token requests ----------------------------- */

export async function tokenRequest(vendor: Vendor, params: Record<string, string>) {
  const v = VENDORS[vendor];
  const { id, secret } = creds(vendor);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const body = new URLSearchParams(params);
  if (v.basicAuth) headers["Authorization"] = `Basic ${btoa(`${id}:${secret}`)}`;
  else {
    body.set("client_id", id);
    body.set("client_secret", secret);
  }
  const res = await fetch(v.tokenUrl, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${vendor} token request failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    x_user_id?: number | string;
  };
}

export async function storeTokens(
  userId: string,
  vendor: Vendor,
  tok: { access_token: string; refresh_token?: string; expires_in?: number; x_user_id?: number | string },
  keepRefreshIfMissing?: string | null,
) {
  const expires_at = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;
  const { error } = await admin().from("wearable_tokens").upsert({
    user_id: userId,
    vendor,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? keepRefreshIfMissing ?? null,
    expires_at,
    vendor_user_id: tok.x_user_id != null ? String(tok.x_user_id) : undefined,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,vendor" });
  if (error) throw new Error(`token store failed: ${error.message}`);
}

export async function freshAccessToken(userId: string, vendor: Vendor) {
  const db = admin();
  const { data, error } = await db
    .from("wearable_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("vendor", vendor)
    .maybeSingle();
  if (error) throw new Error(`token read failed: ${error.message}`);
  if (!data) throw new Error(`no ${vendor} connection for this user`);

  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : 0;
  const stale = !expiresAt || expiresAt - Date.now() < 120_000;
  if (!stale) return data.access_token as string;
  if (!data.refresh_token) return data.access_token as string;

  try {
    const tok = await tokenRequest(vendor, {
      grant_type: "refresh_token",
      refresh_token: data.refresh_token as string,
    });
    await storeTokens(userId, vendor, tok, data.refresh_token as string);
    return tok.access_token;
  } catch (e) {
    await db.from("wearable_connections").update({
      status: "needs_reauth",
      last_error: String(e).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("vendor", vendor);
    throw e;
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
