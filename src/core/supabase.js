// Supabase client + authentication for the coach app.
//
// Deliberately thin, and deliberately close to the client apps' version of
// this file: it creates the client, sends a magic link, and reports who is
// signed in. It knows nothing about training data.
//
// One real difference from the client apps. Those work fully offline in
// local-only mode, because a person must be able to tick off a session in a
// gym basement. This app has nothing to show without a connection — every row
// it displays belongs to someone else and lives only on the server. So there
// is no local-only mode here, and a signed-out state is just a sign-in screen.

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_STORAGE_KEY } from "../config.jsx";

let client = null;

/** The shared client, or null if this build has no Supabase settings. */
export function getClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  if (client) return client;

  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,     // survive closing the tab
      autoRefreshToken: true,   // hourly token renewal, invisible to the user
      detectSessionInUrl: true, // pick up the magic link when it lands
      storageKey: AUTH_STORAGE_KEY,
    },
  });
  return client;
}

/** Is this build wired to Supabase at all? */
export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Where the magic link should return to — the page the user is actually on.
 *
 * This exact URL must also be listed under Authentication → URL Configuration
 * → Redirect URLs in the Supabase dashboard. Anything not on that list is
 * silently rewritten to the project's Site URL, which would drop the coach
 * into one of the client apps instead.
 */
function redirectTarget() {
  if (typeof window === "undefined") return undefined;
  return window.location.origin + window.location.pathname;
}

/**
 * Send a sign-in link. Resolves to { ok, error } — never throws, because a
 * typo or a dead network must not take the page down.
 */
export async function sendMagicLink(email) {
  const c = getClient();
  if (!c) return { ok: false, error: "This build is not connected to an account service." };

  const address = (email || "").trim();
  if (!address || !address.includes("@")) {
    return { ok: false, error: "That does not look like an email address." };
  }

  try {
    const { error } = await c.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: redirectTarget(),
        // No silent account creation. An unknown address gets an error rather
        // than a new empty account — which here would also mean an account
        // with no coach links and therefore an empty, confusing dashboard.
        shouldCreateUser: false,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

/** The signed-in user, or null. Never throws. */
export async function currentUser() {
  const c = getClient();
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    return data?.session?.user || null;
  } catch (e) {
    return null;
  }
}

/**
 * Watch for sign-in and sign-out. Returns an unsubscribe function.
 * Fires on signing in, signing out, and each silent token refresh.
 */
export function onAuthChange(handler) {
  const c = getClient();
  if (!c) return () => {};
  try {
    const { data } = c.auth.onAuthStateChange((_event, session) => {
      handler(session?.user || null);
    });
    return () => data?.subscription?.unsubscribe?.();
  } catch (e) {
    return () => {};
  }
}

/** Sign out on this device only. */
export async function signOut() {
  const c = getClient();
  if (!c) return;
  try {
    await c.auth.signOut({ scope: "local" });
  } catch (e) {
    /* already gone, or offline — nothing to do */
  }
}
