// Coach-PTapp — dashboard.
//
// One client at a time, chosen in the sidebar (top switcher below 1024 px);
// the client's page is a tab row: Overview, Training log, Progress, Programme,
// Versions. Client and tab live in the URL hash (#/<personId>/<tab>).

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { currentUser, onAuthChange, sendMagicLink, signOut, isConfigured } from "./core/supabase.js";
import { loadAll, insertProgramVersion, deleteFutureVersion, canDeleteVersion } from "./core/data.js";
import { preflight } from "./core/publish.js";
import { CheckResult } from "./check-result.jsx";
import { ProgrammeEditor } from "./editor.jsx";
import { buildAllAdherence, pctLabel } from "./core/adherence.js";
import { buildNameMap } from "./core/names.js";
import { buildRecovery, connectionLabel } from "./core/recovery.js";
import { Overview } from "./overview.jsx";
import { buildPersonCtx, needsAttention } from "./core/overview.js";
import { loadDraft } from "./core/editor.js";
import { resolveForDate } from "./core/program-schema.js";
import { Progress } from "./progress.jsx";
import { LogWeek, DayCardView } from "./logweek.jsx";
import { THEME as T, FONT_DISPLAY, FONT_BODY, FONT_MONO, COACH_VERSION } from "./config.jsx";

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "log", label: "Training log" },
  // The id stays "recovery" so old #/<person>/recovery links still open it.
  { id: "recovery", label: "Progress" },
  { id: "programme", label: "Programme" },
  { id: "versions", label: "Versions" },
];

/** "#/<personId>/<tab>" → { personId, tab }; anything unknown is left null. */
export function parseHash(hash) {
  const m = /^#\/([^/]+)(?:\/([^/]+))?/.exec(hash || "");
  const tab = m && TABS.some((t) => t.id === m[2]) ? m[2] : null;
  return { personId: m ? decodeURIComponent(m[1]) : null, tab };
}

const readHash = () => (typeof window === "undefined" ? { personId: null, tab: null } : parseHash(window.location.hash));

export default function CoachApp() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState(readHash);
  // Bumped after a successful publish so the loader re-runs and the days are
  // re-scored against the new version. A state key rather than re-setting
  // `user` to a fresh object, which worked only as a side effect of the
  // effect's dependency being compared by identity.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let dead = false;
    (async () => {
      const u = await currentUser();
      if (!dead) {
        setUser(u);
        setChecking(false);
      }
    })();
    const stop = onAuthChange((u) => {
      setUser(u);
      setChecking(false);
    });
    return () => {
      dead = true;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setData(null);
      return;
    }
    let dead = false;
    setLoading(true);
    (async () => {
      const result = await loadAll(user);
      if (dead) return;
      setData(result);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [user, reloadKey]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // EVERY hook must run on EVERY render, so all of them live above the early
  // returns below. The first draft of Phase 6 put these two useMemo calls
  // after `if (checking) return`, which meant the first render registered 9
  // hooks and the second registered 11. React aborts the whole tree on that
  // mismatch, and the page renders as nothing at all.
  const roster = data?.roster || [];
  const person = roster.find((p) => p.id === route.personId) || roster[0] || null;
  const tab = route.tab || "overview";
  const personKey = person ? person.id : null;
  const days = person && data ? mergeDays(data, person.id) : [];
  // Scored for the whole roster at once, not just the selected person: the
  // switcher shows each person's headline number, and computing it per
  // selection would mean the coach path only ever runs for whoever is open.
  const adherence = useMemo(
    () => (data && data.ok ? buildAllAdherence(data.roster, data.logs, data.overrides, data.programs) : {}),
    [data]
  );
  const personAdherence = person ? adherence[person.id] || null : null;
  const pctByDay = useMemo(() => {
    const out = {};
    if (personAdherence) personAdherence.days.forEach((d) => (out[d.date] = d));
    return out;
  }, [personAdherence]);
  // Built from this person's own programs plus their own ad-hoc activities,
  // so a name can never leak from one client's program into another's day.
  // Same hook discipline as the two above: computed for the selected person,
  // but declared here so the hook count never changes between renders.
  const recovery = useMemo(() => {
    if (!data || !data.ok || !person) return null;
    const w = data.wearables || {};
    return buildRecovery((w.days || {})[person.id] || [], (w.workouts || {})[person.id] || [], person.id);
  }, [data, person]);
  const connections = useMemo(() => {
    if (!data || !data.ok || !person) return [];
    return ((data.wearables || {}).connections || []).filter((c) => c.user_id === person.id);
  }, [data, person]);
  const names = useMemo(() => {
    if (!data || !data.ok || !person) return {};
    const versions = (data.programs || [])
      .filter((r) => r.assigned_to === person.id && r.definition)
      .map((r) => ({ definition: r.definition }));
    return buildNameMap(versions, (data.overrides || {})[person.id]);
  }, [data, person]);

  const ctx = useMemo(() => {
    if (!data || !data.ok || !person || person.state === "paused") return null;
    return buildPersonCtx(data, person, {
      today: new Date(),
      recovery,
      adherence: personAdherence,
      names,
    });
  }, [data, person, recovery, personAdherence, names]);
  // Sidebar dots: one attention check per person, scored once per load.
  // Drafts are read at render time (below) so a saved draft shows at once.
  const attention = useMemo(() => {
    const out = {};
    if (!data || !data.ok) return out;
    const today = new Date();
    roster.forEach((p) => {
      if (p.state === "paused") return;
      const w = data.wearables || {};
      const c = buildPersonCtx(data, p, {
        today,
        recovery: buildRecovery((w.days || {})[p.id] || [], (w.workouts || {})[p.id] || [], p.id),
        adherence: adherence[p.id] || null,
        names: {},
      });
      out[p.id] = { ctx: c, count: needsAttention(c).length };
    });
    return out;
  }, [data, roster, adherence]);

  if (checking) {
    return (
      <Shell>
        <Muted>Checking your session…</Muted>
      </Shell>
    );
  }
  if (!user) return <SignIn />;

  const goto = (personId, t) => {
    window.location.hash = `#/${encodeURIComponent(personId)}/${t}`;
  };
  const dots = {};
  roster.forEach((p) => {
    if (p.state === "paused") dots[p.id] = "paused";
    else {
      const a = attention[p.id];
      const draft = a ? loadDraft(safeStorage(), p.id) : null;
      dots[p.id] = a && (a.count > 0 || draft) ? "attention" : "ok";
    }
  });

  if (!data || !data.ok) {
    return (
      <Shell>
        <Header email={user.email} />
        {loading && <Muted>Loading training data…</Muted>}
        {data && !data.ok && <Problem>{data.error}</Problem>}
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="lg:flex lg:min-h-screen">
        <Sidebar
          roster={roster}
          selectedId={person ? person.id : null}
          onSelect={(id) => goto(id, tab)}
          dots={dots}
          email={user.email}
        />
        <main className="flex-1 min-w-0 px-5 py-6 lg:px-8">
          {loading && <Muted>Loading training data…</Muted>}
          {person && (
            <>
              <ClientHeader person={person} programs={data.programs || []} connections={connections} />
              <TabRow tab={tab} onSelect={(t) => goto(person.id, t)} />
              <PersonPanel
                key={person.id}
                tab={tab}
                person={person}
                days={days}
                total={days.length}
                adherence={personAdherence}
                pctByDay={pctByDay}
                recovery={recovery}
                connections={connections}
                names={names}
                programs={data.programs || []}
                logRows={(data.logs || {})[person.id] || []}
                overrideRows={(data.overrides || {})[person.id] || []}
                ownerId={user.id}
                ctx={ctx ? { ...ctx, draft: draftInfo(person.id) } : null}
                onPublished={() => setReloadKey((k) => k + 1)}
              />
            </>
          )}

          <p style={{ color: T.textMuted }} className="text-[11px] mt-8">
            Coach dashboard {COACH_VERSION} · laptop layout: sidebar per client, Overview first. Logged values with
            adherence scored against the program in force on each day. Exercise names still show as IDs.
          </p>
        </main>
      </div>
    </Shell>
  );
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch (e) {
    return { getItem: () => null };
  }
}

function draftInfo(personId) {
  const d = loadDraft(safeStorage(), personId);
  return d ? { savedAt: d.savedAt } : null;
}

/* ------------------------------- data joins ------------------------------- */

/** One row per day the person either logged or rescheduled, newest first. */
function mergeDays(data, userId) {
  const logs = (data.logs || {})[userId] || [];
  const overrides = (data.overrides || {})[userId] || [];
  const byDay = {};
  logs.forEach((r) => {
    byDay[r.day] = { day: r.day, log: r.payload, override: null, updated: r.updated_at };
  });
  overrides.forEach((r) => {
    if (!byDay[r.day]) byDay[r.day] = { day: r.day, log: null, override: r.payload, updated: null };
    else byDay[r.day].override = r.payload;
  });
  return Object.values(byDay).sort((a, b) => (a.day < b.day ? 1 : -1));
}

/* --------------------------------- screens -------------------------------- */

function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const r = await sendMagicLink(email);
    setBusy(false);
    setStatus(r.ok ? { ok: true, text: "Link sent. Open it in this browser." } : { ok: false, text: r.error });
  }, [email]);

  return (
    <Shell>
      <h1 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-2xl font-bold">
        Coach
      </h1>
      <p style={{ color: T.textSecondary }} className="text-sm mt-1 mb-5">
        Sign in to see your clients' training.
      </p>

      {!isConfigured() ? (
        <Problem>This build has no account service configured.</Problem>
      ) : (
        <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border p-4 max-w-sm">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) submit();
            }}
            placeholder="you@example.com"
            style={{ fontFamily: FONT_BODY, color: T.textPrimary, background: T.bg, borderColor: T.border }}
            className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus-visible:ring-2"
          />
          <button
            onClick={submit}
            disabled={busy}
            style={{ background: T.accent, color: T.onAccent, opacity: busy ? 0.6 : 1 }}
            className="w-full mt-2 text-sm font-semibold py-2 rounded-lg focus:outline-none focus-visible:ring-2"
          >
            {busy ? "Sending…" : "Send sign-in link"}
          </button>
          {status && (
            <p style={{ color: status.ok ? T.accentAlt : T.warn }} className="text-xs mt-2">
              {status.text}
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}

function Header({ email }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-2xl font-bold">
          Coach
        </h1>
        <p style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="text-xs mt-0.5">
          {email}
        </p>
      </div>
      <button
        onClick={signOut}
        style={{ borderColor: T.border, color: T.textSecondary }}
        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
      >
        Sign out
      </button>
    </div>
  );
}

const DOT = {
  ok: { colour: () => T.good, text: "Nothing needs attention" },
  attention: { colour: () => T.accent, text: "Needs attention" },
  paused: { colour: () => T.textMuted, text: "Sharing paused" },
};

/** Column sized to its longest name (128–200 px) at >= 1024 px; below that it is the old top switcher. */
function Sidebar({ roster, selectedId, onSelect, dots, email }) {
  return (
    <aside
      style={{ borderColor: T.border, background: T.bg }}
      className="px-5 py-4 border-b lg:border-b-0 lg:border-r lg:w-fit lg:min-w-[128px] lg:max-w-[200px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col lg:px-2 lg:py-5"
    >
      <h1 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-2xl font-bold lg:mb-4 lg:px-2.5">
        Coach
      </h1>
      <nav aria-label="Clients" className="flex gap-2 flex-wrap mt-3 lg:mt-0 lg:block lg:space-y-1 lg:flex-1 lg:overflow-y-auto">
        {roster.map((p) => {
          const active = p.id === selectedId;
          const dot = DOT[dots[p.id] || "ok"];
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              aria-current={active ? "page" : undefined}
              title={p.name}
              style={{
                background: active ? T.rowSelected : "transparent",
                boxShadow: active ? `inset 2px 0 0 ${T.accent}` : "none",
                color: T.textPrimary,
              }}
              className="text-left rounded-lg px-2.5 py-2 lg:block lg:w-full focus:outline-none focus-visible:ring-2"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ background: dot.colour() }}
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                />
                <span className="sr-only">{dot.text}: </span>
                <span className="text-sm font-semibold truncate">{p.name}</span>
                {p.isSelf && <span style={{ color: T.textMuted }} className="text-[11px] shrink-0">(you)</span>}
                {p.state === "paused" && <span style={{ color: T.textMuted }} className="text-[11px] shrink-0">paused</span>}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-4 lg:mt-3 flex items-center justify-between gap-3 lg:block lg:px-0.5">
        <p style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="text-[10px]">
          Coach {COACH_VERSION}
        </p>
        <button
          onClick={signOut}
          title={email}
          style={{ borderColor: T.border, color: T.textSecondary }}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border lg:mt-2 lg:w-full focus:outline-none focus-visible:ring-2"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function ClientHeader({ person, programs, connections }) {
  const rows = programs.filter((r) => r.assigned_to === person.id && r.definition);
  const v = resolveForDate(rows, new Date());
  return (
    <div className="mb-4">
      <h2 style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-2xl font-bold">
        {person.name}
      </h2>
      <div className="flex items-center gap-2 flex-wrap mt-1">
        <span style={{ color: T.textSecondary }} className="text-xs">
          {v ? `${v.name} · from ${fromLabel(v.effective_from)}` : "No programme assigned"}
        </span>
        {person.state !== "paused" &&
          connections.map((c) => {
            const l = connectionLabel(c);
            return (
              <Tag key={c.vendor} tone={l.tone === "good" ? "good" : l.tone === "warn" ? "warn" : undefined} mono>
                {c.vendor} · {l.text}
              </Tag>
            );
          })}
      </div>
    </div>
  );
}

const fromLabel = (v) => (v === "-infinity" || v == null ? "the start" : String(v).slice(0, 10));

function TabRow({ tab, onSelect }) {
  return (
    <div
      role="tablist"
      style={{ boxShadow: `inset 0 -1px 0 ${T.border}` }}
      className="flex gap-1 mb-4 overflow-x-auto overflow-y-hidden lg:overflow-visible"
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.id)}
            style={{
              color: active ? T.textPrimary : T.textSecondary,
              borderColor: active ? T.accent : "transparent",
            }}
            className="shrink-0 text-sm font-semibold px-3 py-2 border-b-2 focus:outline-none focus-visible:ring-2"
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function PersonPanel({ tab = "overview", person, days, total, adherence, pctByDay, recovery, connections, names, programs, logRows, overrideRows, ownerId, ctx, onPublished }) {
  // The three states that must never be confused with one another.
  if (person.state === "paused") {
    return (
      <Notice tone="pause" title="Sharing is paused">
        This person has switched sharing off, so their training data is not visible to you right now — including their
        name. This is <strong>not</strong> the same as having logged nothing: there may well be days behind this. It
        comes back the moment they switch sharing on again, and nothing is lost meanwhile.
      </Notice>
    );
  }

  return (
    <>
      {person.state === "unnamed" && (
        <div className="mb-3">
          <Notice tone="warn" title="No profile row">
            This person is sharing with you, but has no row in profiles, so there is no name to show. Their data below is
            complete — only the label is missing.
          </Notice>
        </div>
      )}

      {tab === "overview" && ctx && <Overview key={person.id} ctx={ctx} />}

      {tab === "log" &&
        (total === 0 ? (
          <Notice tone="quiet" title="No days logged yet">
            {person.name} is sharing with you, and nothing has been recorded so far.
          </Notice>
        ) : (
          <>
            <Adherence person={person} adherence={adherence} compact />
            <LogWeek
              key={person.id}
              person={person}
              logRows={logRows || []}
              overrideRows={overrideRows || []}
              programRows={(programs || []).filter((r) => r.assigned_to === person.id)}
              pctByDay={pctByDay}
              names={names}
            />
          </>
        ))}

      {tab === "recovery" && ctx && (
        <Progress key={person.id} ctx={ctx} recovery={recovery} connections={connections} names={names} />
      )}

      {tab === "programme" && (
        <ProgrammeEditor
          person={person}
          programs={programs}
          logRows={logRows}
          ownerId={ownerId}
          onPublished={onPublished}
          defaultOpen
        />
      )}

      {tab === "versions" && (
        <>
          <VersionsTable person={person} programs={programs} onDeleted={onPublished} />
          <Publisher
            person={person}
            programs={programs}
            logRows={logRows}
            ownerId={ownerId}
            onPublished={onPublished}
            defaultOpen={false}
          />
        </>
      )}
    </>
  );
}

function VersionsTable({ person, programs, onDeleted }) {
  const [pending, setPending] = useState(null); // id awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const doDelete = async (r) => {
    setBusy(true);
    const res = await deleteFutureVersion(r.id);
    setBusy(false);
    setPending(null);
    setMsg(res.ok ? { ok: true, text: `Deleted ${r.id} (effective ${fromLabel(r.effective_from)}).` } : { ok: false, text: "✕ " + res.error });
    if (res.ok && onDeleted) onDeleted();
  };
  const rows = programs
    .filter((r) => r.assigned_to === person.id)
    .slice()
    .sort((a, b) => {
      const ka = a.effective_from === "-infinity" ? "" : String(a.effective_from);
      const kb = b.effective_from === "-infinity" ? "" : String(b.effective_from);
      return ka < kb ? 1 : ka > kb ? -1 : 0;
    });
  const inForce = resolveForDate(rows.filter((r) => r.definition), new Date());
  if (!rows.length) {
    return (
      <Notice tone="warn" title="No programme versions">
        No program row is assigned to {person.name}.
      </Notice>
    );
  }
  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-xl border px-4 py-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: T.textMuted }} className="text-[10px] uppercase tracking-wide text-left">
            <th className="font-normal pb-1">Id</th>
            <th className="font-normal pb-1">Name</th>
            <th className="font-normal pb-1">Effective from</th>
            <th className="font-normal pb-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderColor: T.border, color: T.textPrimary }} className="border-t">
              <td style={{ fontFamily: FONT_MONO }} className="py-1.5 pr-3">{r.id}</td>
              <td className="py-1.5 pr-3">{r.name}</td>
              <td style={{ fontFamily: FONT_MONO }} className="py-1.5 pr-3">{fromLabel(r.effective_from)}</td>
              <td className="py-1.5">
                {inForce && inForce.id === r.id && <Tag tone="good">in force</Tag>}
                {canDeleteVersion(r) && pending !== r.id && (
                  <button
                    type="button"
                    data-action="delete-version"
                    disabled={busy}
                    onClick={() => { setMsg(null); setPending(r.id); }}
                    style={{ borderColor: T.warn, color: T.warn }}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md border focus:outline-none focus-visible:ring-2"
                  >
                    Delete version
                  </button>
                )}
                {pending === r.id && (
                  <span data-part="delete-confirm" style={{ color: T.warn }} className="text-[11px] inline-flex flex-wrap items-center gap-2">
                    Delete {r.id}, effective {fromLabel(r.effective_from)}? It has not started; nothing has been scored against it.
                    <button type="button" data-action="delete-confirm" disabled={busy} onClick={() => doDelete(r)}
                            style={{ borderColor: T.warn, color: T.warn }}
                            className="font-semibold px-2 py-0.5 rounded-md border focus:outline-none focus-visible:ring-2">
                      {busy ? "Deleting…" : "Confirm"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setPending(null)}
                            style={{ borderColor: T.border, color: T.textSecondary }}
                            className="font-semibold px-2 py-0.5 rounded-md border focus:outline-none focus-visible:ring-2">
                      Cancel
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p style={{ color: msg.ok ? T.good : T.warn }} className="text-[11px] mt-2">{msg.text}</p>}
    </div>
  );
}

/* -------------------------------- publishing ------------------------------ */

/**
 * Paste-and-validate publishing of a new program version.
 *
 * Collapsed by default and placed last, because this is the one write in an
 * otherwise read-only dashboard and it should not sit in the way of reading.
 *
 * Two-step by construction: the Publish button does not exist until a check
 * has passed, and any edit to the paste or the date discards that result. It
 * is not possible to check one thing and publish another.
 *
 * All state is local to this component. The blank page that shipped in the
 * first Phase 6 build came from hooks added to CoachApp below its early
 * returns; keeping this self-contained means it cannot reach them.
 */
export function Publisher({ person, programs, logRows, ownerId, onPublished, defaultOpen }) {
  // `defaultOpen` exists so the open form can be render-tested. Without it the
  // harness could only ever see the collapsed button and would report two
  // passing states that were the same 203 characters twice.
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [text, setText] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // tomorrow: forward-only, and not today by accident
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(null);

  // Any change invalidates a previous check, so the button cannot outlive it.
  const edit = (setter) => (v) => {
    setResult(null);
    setPublished(null);
    setter(v);
  };

  const runCheck = useCallback(() => {
    setResult(
      preflight({
        person,
        text,
        effectiveFrom: when,
        existingRows: programs,
        logRows,
        ownerId,
      })
    );
  }, [person, text, when, programs, logRows, ownerId]);

  const doPublish = useCallback(async () => {
    if (!result || !result.ok || !result.row) return;
    setBusy(true);
    const r = await insertProgramVersion(result.row);
    setBusy(false);
    setPublished(r);
    if (r.ok) {
      setResult(null);
      setText("");
      // Re-load, so the days above are immediately re-scored against the
      // version just published. Without this the dashboard would keep showing
      // percentages from the superseded program until a manual refresh.
      if (onPublished) onPublished();
    }
  }, [result, onPublished]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ borderColor: T.border, color: T.textSecondary }}
        className="w-full mt-4 text-xs font-semibold py-2 rounded-lg border focus:outline-none focus-visible:ring-2"
      >
        Publish a new program version for {person.name}
      </button>
    );
  }

  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border px-4 py-3 mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-sm font-bold">
          Publish a version for {person.name}
        </p>
        <button
          onClick={() => setOpen(false)}
          style={{ color: T.textSecondary }}
          className="text-xs font-semibold focus:outline-none focus-visible:underline"
        >
          Close
        </button>
      </div>

      <p style={{ color: T.textMuted }} className="text-[11px] mt-1 leading-relaxed">
        This adds a new row; the version in force is never overwritten.{" "}
        <strong style={{ color: T.textSecondary }}>It changes {person.name}'s app</strong> — from the effective date
        their app runs this version (Today offers them the reload; it never swaps a session mid-workout), and the days
        above are scored against it from that date onward.
      </p>

      <label style={{ color: T.textSecondary }} className="text-[11px] block mt-3 mb-1">
        Effective from
      </label>
      <input
        type="date"
        value={when}
        onChange={(e) => edit(setWhen)(e.target.value)}
        style={{ fontFamily: FONT_MONO, color: T.textPrimary, background: T.bg, borderColor: T.border }}
        className="text-xs px-2 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
      />

      <label style={{ color: T.textSecondary }} className="text-[11px] block mt-3 mb-1">
        Program definition (JSON)
      </label>
      <textarea
        value={text}
        onChange={(e) => edit(setText)(e.target.value)}
        rows={6}
        placeholder='Paste the definition object, e.g. {"id":"juha","slots":[…],"schedule":{…},"blocks":{…}}'
        style={{ fontFamily: FONT_MONO, color: T.textPrimary, background: T.bg, borderColor: T.border }}
        className="w-full text-[10px] p-2 rounded-lg border focus:outline-none focus-visible:ring-2"
      />

      <div className="flex gap-2 mt-2">
        <button
          onClick={runCheck}
          disabled={!text.trim()}
          style={{ borderColor: T.border, color: text.trim() ? T.textPrimary : T.textMuted }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
        >
          Check
        </button>
        {result && result.ok && (
          <button
            onClick={doPublish}
            disabled={busy}
            style={{ background: T.good, color: T.onAccent }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus-visible:ring-2"
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>

      <CheckResult result={result} when={when} />

      {published && (
        <p
          style={{ color: published.ok ? T.good : T.warn }}
          className="text-[11px] mt-3 leading-relaxed"
        >
          {published.ok
            ? `Published ${published.row.id}, effective ${published.row.effective_from}. The days above have been re-scored.`
            : "✕ " + published.error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------- adherence -------------------------------- */

/**
 * The headline numbers for one person.
 *
 * Three things this deliberately does NOT do:
 *
 *   - It does not average skip days in. A travel day the client cleared on
 *     purpose is not a day they failed, and folding it into the mean would
 *     punish the honest use of the skip feature.
 *   - It does not show 0% for a day with nothing to do. That reads as a
 *     failure; "nothing scheduled" is a different fact and stays a different
 *     label.
 *   - It does not name the categories. They come out of whichever program was
 *     in force, so Henna's set and Juha's set legitimately differ, and a
 *     hardcoded list here would quietly drop any category a future program
 *     introduces.
 */
// Exported for verify-adherence.mjs: the client-facing sharing toggle shipped
// in Phase 2 proven at the policy level but never once seen rendered, which is
// the failure mode a render test exists to prevent.
export function Adherence({ person, adherence, compact }) {
  if (!adherence) return null;

  if (adherence.noProgram) {
    return (
      <Notice tone="warn" title="No program assigned">
        {person.name} has {adherence.unscored.length} logged day
        {adherence.unscored.length === 1 ? "" : "s"}, but no program row is assigned to them, so there is nothing to
        score those days against. The days below are still shown in full — only the percentages are missing. Assign a
        program to this person in <span style={{ fontFamily: FONT_MONO }}>programs.assigned_to</span>.
      </Notice>
    );
  }

  const s = adherence.summary;
  const cats = Object.keys(s.byCat);

  // One line above the week grid: the same numbers, without the per-category bars.
  if (compact) {
    return (
      <div
        data-part="adherence-compact"
        style={{ background: T.card, borderColor: T.border }}
        className="rounded-xl border px-4 py-2 mb-4 flex items-baseline gap-x-5 gap-y-1 flex-wrap text-xs"
      >
        <span style={{ color: T.textSecondary }}>
          Last 30 days <strong style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-sm ml-1">{pctLabel(adherence.last30.avgPct)}</strong>
        </span>
        <span style={{ color: T.textSecondary }}>
          All time <strong style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="ml-1">{pctLabel(s.avgPct)}</strong>
        </span>
        <span style={{ color: T.textSecondary }}>
          Days scored <strong style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="ml-1">{s.scoredDays}</strong>
        </span>
        {s.skipDays > 0 && (
          <span style={{ color: T.textSecondary }}>
            Cleared <strong style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="ml-1">{s.skipDays}</strong>
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border px-4 py-3 mb-3">
      <div className="flex items-baseline gap-4 flex-wrap">
        <Figure label="Last 30 days" value={pctLabel(adherence.last30.avgPct)} big />
        <Figure label="All time" value={pctLabel(s.avgPct)} />
        <Figure label="Days scored" value={String(s.scoredDays)} />
        {s.skipDays > 0 && <Figure label="Cleared" value={String(s.skipDays)} />}
      </div>

      {cats.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {cats.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <span style={{ color: T.textSecondary }} className="text-[11px] w-20 shrink-0 capitalize">
                {c}
              </span>
              <span
                style={{ background: T.border }}
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                aria-hidden="true"
              >
                <span
                  style={{
                    background: s.byCat[c].pct >= 0.8 ? T.good : s.byCat[c].pct >= 0.5 ? T.accent : T.warn,
                    width: Math.round((s.byCat[c].pct || 0) * 100) + "%",
                    display: "block",
                    height: "100%",
                  }}
                />
              </span>
              <span style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="text-[11px] w-24 text-right shrink-0">
                {pctLabel(s.byCat[c].pct)} · {s.byCat[c].done}/{s.byCat[c].total}
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ color: T.textMuted }} className="text-[10px] mt-3 leading-relaxed">
        Scored against{" "}
        {adherence.versionsUsed.map((v) => v.name + " (" + v.dayCount + "d)").join(", ") || "no program"}. Cleared days
        are excluded from the averages rather than counted as zero.
        {adherence.unscored.length > 0 &&
          " " + adherence.unscored.length + " day(s) fall before the first program version and are not scored."}
      </p>
    </div>
  );
}

function Figure({ label, value, big }) {
  return (
    <div>
      <p
        style={{ fontFamily: FONT_MONO, color: T.textPrimary }}
        className={big ? "text-2xl font-semibold leading-none" : "text-base font-semibold leading-none"}
      >
        {value}
      </p>
      <p style={{ color: T.textMuted }} className="text-[10px] mt-1 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

/* -------------------------------- day card -------------------------------- */

/**
 * One day, in full. The card itself is in logweek.jsx beside the week grid it
 * is shown under; this keeps the name and props the tests and the panel know.
 * `detail` and `selected` are optional: without them the card is built from
 * `day` alone.
 */
export function DayCard({ day, scored, names, detail, selected }) {
  return <DayCardView day={day} scored={scored} names={names} detail={detail} selected={selected} />;
}

/* ------------------------------- small parts ------------------------------- */

function Shell({ children, wide }) {
  return (
    <div style={{ background: T.bg, fontFamily: FONT_BODY, minHeight: "100vh" }} className="w-full">
      <FontImport />
      {wide ? <div className="w-full">{children}</div> : <div className="max-w-2xl mx-auto px-5 py-8">{children}</div>}
    </div>
  );
}

function Tag({ children, tone, mono }) {
  const colour =
    tone === "accent"
      ? T.accent
      : tone === "good"
      ? T.good
      : tone === "warn"
      ? T.warn
      : tone === "pause"
      ? T.accentAlt
      : tone === "quiet"
      ? T.textMuted
      : T.textSecondary;
  return (
    <span
      style={{ color: colour, borderColor: T.border, fontFamily: mono ? FONT_MONO : FONT_BODY }}
      className="text-[11px] px-2 py-0.5 rounded-full border"
    >
      {children}
    </span>
  );
}

function Notice({ title, children, tone }) {
  const colour = tone === "pause" ? T.accentAlt : tone === "warn" ? T.accent : T.textMuted;
  return (
    <div
      style={{ background: T.card, borderColor: T.border, borderLeftColor: colour }}
      className="rounded-2xl border border-l-4 px-4 py-3"
    >
      <p style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-sm font-bold">
        {title}
      </p>
      <p style={{ color: T.textSecondary }} className="text-xs mt-1 leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function Problem({ children }) {
  return (
    <div style={{ background: T.card, borderColor: T.warn }} className="rounded-xl border px-4 py-3">
      <p style={{ color: T.warn }} className="text-sm">
        {children}
      </p>
    </div>
  );
}

function Muted({ children }) {
  return (
    <p style={{ color: T.textMuted }} className="text-sm">
      {children}
    </p>
  );
}

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      html, body, #root { background: ${T.bg}; min-height: 100%; }
      body { margin: 0; }
    `}</style>
  );
}
