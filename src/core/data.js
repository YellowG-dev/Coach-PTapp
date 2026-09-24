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

  // Wearable history is windowed rather than unbounded: a year of nights is
  // more than any dashboard view uses, and the rows are wider than day_logs.
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const sinceKey = since.toISOString().slice(0, 10);

  try {
    const [links, profiles, logs, overrides, programs, connections, wDays, wWorkouts] = await Promise.all([
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

      // Wearables, same rule as everything above: no user_id filter, RLS
      // decides. The coach sees a client's rows through is_coach_of() and his
      // own through the owner branch — one code path for both. `raw` is
      // deliberately not selected; it holds the full vendor payload and is for
      // later mapping work, not for rendering.
      c.from("wearable_connections").select("user_id, vendor, status, connected_at, last_synced_at, last_error"),
      c
        .from("wearable_days")
        .select("user_id, vendor, day, sleep_minutes, readiness, resting_hr, hrv, steps")
        .gte("day", sinceKey)
        .order("day", { ascending: false }),
      c
        .from("wearable_workouts")
        .select("user_id, vendor, day, sport, source, started_at, duration_minutes, distance_km, hr_avg, hr_max")
        .gte("day", sinceKey)
        .order("started_at", { ascending: false }),
    ]);

    const firstError = links.error || profiles.error || logs.error || overrides.error || programs.error;
    if (firstError) return { ok: false, error: firstError.message, roster: [], logs: {}, overrides: {}, programs: [] };

    // A wearable failure must not blank the dashboard. Training data is the
    // point of this page; recovery is an addition to it, so an error here
    // degrades to "no wearable data" and the rest still renders.
    const wearableError = connections.error || wDays.error || wWorkouts.error;

    const roster = buildRoster(me, links.data || [], profiles.data || [], logs.data || []);
    return {
      ok: true,
      error: null,
      roster,
      logs: groupByUser(logs.data || []),
      overrides: groupByUser(overrides.data || []),
      programs: programs.data || [],
      wearables: {
        error: wearableError ? wearableError.message : null,
        connections: connections.data || [],
        days: groupByUser(wDays.data || []),
        workouts: groupByUser(wWorkouts.data || []),
      },
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

/* ----------------------------- Writing (Phase 7) -------------------------- */

/**
 * Insert one new program version. Never an UPDATE of the row in force —
 * versions are forward-only and a new version is a new row. The unique index
 * `(assigned_to, effective_from)` is the backstop; `preflight()` in
 * publish.js is what gives the coach a readable answer before it fires.
 *
 * The only write this dashboard performs. Everything else here is read-only,
 * and that is deliberate: coach access to a client's *logs* stays read-only
 * by design. A program is the coach's own row, not the client's data.
 */
export async function insertProgramVersion(row) {
  if (!row || !row.id || !row.assigned_to || !row.effective_from) {
    return { ok: false, error: "Nothing to publish — run the check first." };
  }
  const c = getClient();
  if (!c) return { ok: false, error: "Not connected." };

  try {
    const { data, error } = await c.from("programs").insert(row).select("id, name, effective_from").single();
    if (error) {
      // The two failures that will actually happen both have unhelpful native
      // text, so they are named here rather than passed through raw.
      if (error.code === "23505") {
        return {
          ok: false,
          error:
            "A version already exists for that client on that date, or that program id is taken. Reload and pick another date.",
        };
      }
      if (error.code === "42501" || /row-level security/i.test(error.message || "")) {
        return {
          ok: false,
          error:
            "The database refused the write. The usual cause is that this client has paused sharing — coach permissions require sharing to be on (is_coach_of checks sharing_enabled).",
        };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, row: data };
  } catch (e) {
    return { ok: false, error: "Could not reach the server." };
  }
}
