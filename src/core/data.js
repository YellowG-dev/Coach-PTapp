// Reading everyone's training data — roster, logs, overrides.
//
// THE ONE RULE IN THIS FILE: no query here filters by user_id.
//
// The coach's own rows arrive through the `owner` branch of the RLS policy
// (user_id = auth.uid()); a client's arrive through the `coach` branch
// (is_coach_of(user_id)). Those are two different code paths *in the
// database*, but they must be one code path *here*. If we fetched "my data"
// and "their data" separately, the coach path would be exercised only against
// Henna's single row and Joonatan's three — and a dashboard that looks
// polished on fifty rows of your own data can quietly fail for an actual
// client. So: one query per table, no filters, and RLS decides what comes
// back. Whatever renders for you renders for them, through the same code.

import { getClient } from "./supabase.js";

/**
 * Everything the dashboard needs, in one round trip.
 * Resolves to { ok, error, me, roster, logs, overrides, programs }.
 * Never throws.
 */
export async function loadAll(me) {
  const c = getClient();
  if (!c || !me) return { ok: false, error: "Not signed in.", roster: [], logs: {}, overrides: {}, programs: [] };

  try {
    const [links, profiles, logs, overrides, programs] = await Promise.all([
      c.from("coach_links").select("coach_id, client_id, sharing_enabled"),
      c.from("profiles").select("id, display_name"),
      c.from("day_logs").select("user_id, day, payload, updated_at").order("day", { ascending: false }),
      c.from("day_overrides").select("user_id, day, payload").order("day", { ascending: false }),
      // Fifth query, same rule: unfiltered, RLS decides. programs_select is
      // (owner_id = auth.uid() OR assigned_to = auth.uid()), so the coach gets
      // the ones he owns and a client would get only their own assigned row.
      // `effective_from` is a date that may be the string "-infinity" — it is
      // passed through untouched and interpreted in adherence.js.
      c.from("programs").select("id, name, owner_id, assigned_to, effective_from, definition"),
    ]);

    const firstError = links.error || profiles.error || logs.error || overrides.error || programs.error;
    if (firstError) return { ok: false, error: firstError.message, roster: [], logs: {}, overrides: {}, programs: [] };

    const roster = buildRoster(me, links.data || [], profiles.data || [], logs.data || []);
    return {
      ok: true,
      error: null,
      roster,
      logs: groupByUser(logs.data || []),
      overrides: groupByUser(overrides.data || []),
      programs: programs.data || [],
    };
  } catch (e) {
    return { ok: false, error: "Could not reach the server.", roster: [], logs: {}, overrides: {}, programs: [] };
  }
}

function groupByUser(rows) {
  const out = {};
  rows.forEach((r) => {
    if (!out[r.user_id]) out[r.user_id] = [];
    out[r.user_id].push(r);
  });
  return out;
}

/**
 * Who this coach can see, and in what state.
 *
 * Three states have to stay distinguishable, because two of them render
 * identically if you aren't deliberate:
 *
 *   "ok"      — sharing on, data may or may not exist
 *   "paused"  — sharing switched off by the client
 *   "unnamed" — sharing on, but no profiles row exists for them
 *
 * The paused case is readable at all only because `coach_links_select` is
 * (coach_id = auth.uid() OR client_id = auth.uid()) with no sharing
 * condition — so the link row survives even when the person's profile and
 * every row of their data becomes invisible. That is what lets the dashboard
 * say "sharing paused" instead of the much worse "no data yet".
 *
 * The coach's own entry is built from the session, never from coach_links.
 * A self-link must never exist: is_coach_of() requires sharing_enabled, so
 * switching your own sharing off would make you vanish from your own
 * dashboard.
 */
function buildRoster(me, links, profiles, logRows) {
  const nameById = {};
  profiles.forEach((p) => (nameById[p.id] = p.display_name));

  const dayCount = {};
  logRows.forEach((r) => (dayCount[r.user_id] = (dayCount[r.user_id] || 0) + 1));

  const self = {
    id: me.id,
    name: nameById[me.id] || localPart(me.email) || "You",
    named: Boolean(nameById[me.id]),
    isSelf: true,
    state: "ok",
    sharing: null, // not applicable — own data arrives via the owner branch
    days: dayCount[me.id] || 0,
  };

  const clients = links
    .filter((l) => l.coach_id === me.id && l.client_id !== me.id)
    .map((l) => {
      const named = Boolean(nameById[l.client_id]);
      const paused = l.sharing_enabled === false;
      return {
        id: l.client_id,
        name: named ? nameById[l.client_id] : shortId(l.client_id),
        named,
        isSelf: false,
        state: paused ? "paused" : named ? "ok" : "unnamed",
        sharing: l.sharing_enabled !== false,
        days: dayCount[l.client_id] || 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return [self, ...clients];
}

function localPart(email) {
  if (!email || !email.includes("@")) return null;
  return email.split("@")[0];
}

/** A person with no profiles row shows as an ID — loudly unnamed, not blank. */
function shortId(id) {
  return "Client " + String(id).slice(0, 8);
}
