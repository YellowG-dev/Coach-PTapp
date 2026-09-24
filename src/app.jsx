// Coach-PTapp — dashboard v1.
//
// One client at a time, chosen with the person switcher; below it, that
// person's logged days newest first, showing exactly what they recorded.
// No percentages and no adherence scoring: those need program definitions in
// Supabase, which is Phase 5. Everything here is a raw value the client typed.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { currentUser, onAuthChange, sendMagicLink, signOut, isConfigured } from "./core/supabase.js";
import { loadAll, insertProgramVersion } from "./core/data.js";
import { preflight } from "./core/publish.js";
import { shapeDay, shapeOverride, formatDay, formatSets, labelFor, unitFor } from "./core/shape.js";
import { buildAllAdherence, pctLabel } from "./core/adherence.js";
import { buildNameMap } from "./core/names.js";
import { buildRecovery, connectionLabel, fmtSleep, fmtNum } from "./core/recovery.js";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { THEME as T, FONT_DISPLAY, FONT_BODY, FONT_MONO, COACH_VERSION } from "./config.jsx";

const PAGE = 20; // days rendered before "show earlier"

export default function CoachApp() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [visible, setVisible] = useState(PAGE);
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
      setSelectedId((prev) => prev || result.roster[0]?.id || null);
    })();
    return () => {
      dead = true;
    };
  }, [user, reloadKey]);

  useEffect(() => setVisible(PAGE), [selectedId]);

  // EVERY hook must run on EVERY render, so all of them live above the early
  // returns below. The first draft of Phase 6 put these two useMemo calls
  // after `if (checking) return`, which meant the first render registered 9
  // hooks and the second registered 11. React aborts the whole tree on that
  // mismatch, and the page renders as nothing at all.
  const roster = data?.roster || [];
  const person = roster.find((p) => p.id === selectedId) || roster[0] || null;
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
    return buildRecovery((w.days || {})[person.id] || [], (w.workouts || {})[person.id] || []);
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

  if (checking) {
    return (
      <Shell>
        <Muted>Checking your session…</Muted>
      </Shell>
    );
  }
  if (!user) return <SignIn />;

  return (
    <Shell>
      <Header email={user.email} />

      {loading && <Muted>Loading training data…</Muted>}
      {data && !data.ok && <Problem>{data.error}</Problem>}

      {data && data.ok && (
        <>
          <Switcher roster={roster} selectedId={person ? person.id : null} onSelect={setSelectedId} />
          {person && (
            <PersonPanel
              person={person}
              days={days.slice(0, visible)}
              total={days.length}
              adherence={personAdherence}
              pctByDay={pctByDay}
              recovery={recovery}
              connections={connections}
              names={names}
              programs={data.programs || []}
              logRows={(data.logs || {})[person.id] || []}
              ownerId={user.id}
              onPublished={() => setReloadKey((k) => k + 1)}
              onMore={() => setVisible((v) => v + PAGE)}
            />
          )}
        </>
      )}

      <p style={{ color: T.textMuted }} className="text-[11px] mt-8">
        Coach dashboard {COACH_VERSION} · logged values with adherence scored against the program in force on each
        day. Exercise names still show as IDs.
      </p>
    </Shell>
  );
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

function Switcher({ roster, selectedId, onSelect }) {
  return (
    <div className="flex gap-2 flex-wrap mb-5">
      {roster.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              background: active ? T.accent : "transparent",
              color: active ? T.onAccent : T.textSecondary,
              borderColor: active ? T.accent : T.border,
            }}
            className="text-sm font-semibold px-3.5 py-2 rounded-xl border text-left focus:outline-none focus-visible:ring-2"
          >
            <span>{p.name}</span>
            {p.isSelf && <span style={{ opacity: 0.65 }}> (you)</span>}
            <span style={{ fontFamily: FONT_MONO, opacity: 0.75 }} className="block text-[11px] font-normal">
              {p.state === "paused" ? "sharing paused" : `${p.days} ${p.days === 1 ? "day" : "days"}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PersonPanel({ person, days, total, adherence, pctByDay, recovery, connections, names, programs, logRows, ownerId, onPublished, onMore }) {
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
        <Notice tone="warn" title="No profile row">
          This person is sharing with you, but has no row in profiles, so there is no name to show. Their data below is
          complete — only the label is missing.
        </Notice>
      )}

      {/* Above the logged days on purpose: a person can have wearable data
          before they have logged a single session, and that is worth seeing. */}
      <Recovery recovery={recovery} connections={connections} person={person} />

      {total === 0 ? (
        <Notice tone="quiet" title="No days logged yet">
          {person.name} is sharing with you, and nothing has been recorded so far.
        </Notice>
      ) : (
        <>
          <Adherence person={person} adherence={adherence} />
          <div className="space-y-3">
            {days.map((d) => (
              <DayCard key={d.day} day={d} scored={pctByDay ? pctByDay[d.day] : null} names={names} />
            ))}
          </div>
          {days.length < total && (
            <button
              onClick={onMore}
              style={{ borderColor: T.border, color: T.textSecondary }}
              className="w-full mt-3 text-xs font-semibold py-2 rounded-lg border focus:outline-none focus-visible:ring-2"
            >
              Show earlier days · {total - days.length} more
            </button>
          )}
        </>
      )}

      <Publisher
        person={person}
        programs={programs}
        logRows={logRows}
        ownerId={ownerId}
        onPublished={onPublished}
      />
    </>
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

  const findings = result && result.validation ? result.validation.findings : [];
  const info = findings.filter((f) => f.severity === "info");

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
        <strong style={{ color: T.textSecondary }}>It does not change {person.name}'s app</strong> — the client apps
        build their program in from their own repo and do not read this table. What it changes today is how the days
        above are scored from the effective date onward.
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

      {result && (
        <div className="mt-3 space-y-2">
          {result.inForce && (
            <p style={{ color: T.textMuted }} className="text-[11px]">
              Replacing from {when} onward: {result.inForce.name} (effective {String(result.inForce.effective_from)})
            </p>
          )}
          {result.blocking.map((b, i) => (
            <p key={"b" + i} style={{ color: T.warn }} className="text-[11px] leading-relaxed">
              ✕ {b}
            </p>
          ))}
          {result.warnings.map((w, i) => (
            <p key={"w" + i} style={{ color: T.accent }} className="text-[11px] leading-relaxed">
              ⚠ {w}
            </p>
          ))}
          {result.ok && (
            <p style={{ color: T.good }} className="text-[11px]">
              ✓ Checks passed. {info.length} informational change{info.length === 1 ? "" : "s"}
              {result.validation ? ` · ${result.validation.summary.idsAfter} IDs, ${result.validation.summary.idsLogged} seen in history` : ""}.
              {result.row ? ` Will insert as ${result.row.id}.` : ""}
            </p>
          )}
          {info.length > 0 && (
            <details>
              <summary style={{ color: T.textSecondary }} className="text-[11px] cursor-pointer">
                Show {info.length} informational finding{info.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-1 space-y-0.5">
                {info.map((f, i) => (
                  <p key={i} style={{ color: T.textMuted }} className="text-[10px]">
                    {f.message}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

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

/* -------------------------------- recovery -------------------------------- */

/**
 * Sleep, readiness and heart data from a connected wearable, next to the
 * adherence numbers — the point being that a poor week with three bad nights
 * behind it is a different conversation from a poor week without them.
 *
 * Nothing here is scored or judged. It reports what the device recorded, with
 * gaps left as gaps: a night the ring missed shows a dash, never a zero.
 */
export function Recovery({ recovery, connections, person }) {
  const conns = connections || [];
  if (!recovery) {
    if (!conns.length) return null; // nothing connected, nothing to say
    return (
      <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border px-4 py-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: T.textSecondary }} className="text-xs font-semibold">
            Recovery
          </span>
          {conns.map((c) => {
            const l = connectionLabel(c);
            return (
              <Tag key={c.vendor} tone={l.tone === "good" ? "good" : l.tone === "warn" ? "warn" : undefined} mono>
                {c.vendor} · {l.text}
              </Tag>
            );
          })}
        </div>
        <p style={{ color: T.textMuted }} className="text-[11px] mt-2">
          Connected, but no readings have arrived yet.
        </p>
      </div>
    );
  }

  const { latest, avg7, avg30, series, sessions30, sessionMinutes30, bySport, nights } = recovery;
  const hasSeries = series.some((p) => p.readiness != null || p.sleepH != null);

  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border px-4 py-3 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span style={{ color: T.textSecondary }} className="text-xs font-semibold">
          Recovery
        </span>
        {conns.map((c) => {
          const l = connectionLabel(c);
          return (
            <Tag key={c.vendor} tone={l.tone === "good" ? "good" : l.tone === "warn" ? "warn" : undefined} mono>
              {c.vendor} · {l.text}
            </Tag>
          );
        })}
      </div>

      <div className="flex items-baseline gap-4 flex-wrap">
        <Figure label={latest ? "Sleep · " + latest.day.slice(5) : "Sleep"} value={fmtSleep(latest?.sleep_minutes)} big />
        <Figure label="Readiness" value={fmtNum(latest?.readiness)} />
        <Figure label="Resting HR" value={fmtNum(latest?.resting_hr)} />
        <Figure label="HRV" value={fmtNum(latest?.hrv)} />
        <Figure label="Steps" value={latest?.steps != null ? Number(latest.steps).toLocaleString() : "—"} />
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-2.5">
        <span style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="text-[11px]">
          7-day: {fmtSleep(avg7.sleep)} · readiness {fmtNum(avg7.readiness)} · RHR {fmtNum(avg7.rhr)} · HRV{" "}
          {fmtNum(avg7.hrv)}
        </span>
        <span style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="text-[11px]">
          30-day: {fmtSleep(avg30.sleep)} · readiness {fmtNum(avg30.readiness)} · RHR {fmtNum(avg30.rhr)}
        </span>
      </div>

      {hasSeries && (
        <div style={{ width: "100%", height: 140 }} className="mt-3">
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: T.textMuted, fontSize: 10 }}
                axisLine={{ stroke: T.border }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                domain={[0, 100]}
                tick={{ fill: T.textMuted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <YAxis yAxisId="right" orientation="right" hide domain={[0, 12]} />
              <Tooltip
                contentStyle={{
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                }}
                labelStyle={{ color: T.textSecondary }}
                formatter={(v, name) => [name === "Sleep (h)" ? `${v} h` : v, name]}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="readiness"
                name="Readiness"
                stroke={T.accent}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="sleepH"
                name="Sleep (h)"
                stroke={T.good}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {sessions30 > 0 && (
        <p style={{ color: T.textSecondary }} className="text-[11px] mt-2">
          {sessions30} recorded session{sessions30 === 1 ? "" : "s"} in 30 days · {sessionMinutes30} min ·{" "}
          <span style={{ color: T.textMuted }}>
            {bySport.map((s) => `${s.sport} ${s.n}`).join(", ")}
          </span>
        </p>
      )}

      <p style={{ color: T.textMuted }} className="text-[10px] mt-2 leading-relaxed">
        {nights} night{nights === 1 ? "" : "s"} with a sleep reading in the last 120 days. Amber is readiness, green is
        sleep hours. Missing nights are gaps, not zeroes. Oura's auto-detected walking and housework are stored but not
        counted as sessions here.
      </p>
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
export function Adherence({ person, adherence }) {
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

export function DayCard({ day, scored, names }) {
  const shaped = day.log ? shapeDay(day.log) : null;
  const sched = day.override ? shapeOverride(day.override) : null;
  const label = formatDay(day.day);

  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border overflow-hidden">
      <div
        style={{ borderColor: T.border }}
        className="border-b px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap"
      >
        <div>
          <span style={{ fontFamily: FONT_DISPLAY, color: T.textPrimary }} className="text-sm font-bold">
            {label.weekday}
          </span>
          <span style={{ fontFamily: FONT_MONO, color: T.textMuted }} className="text-xs ml-2">
            {label.full}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {scored && scored.skip && <Tag tone="pause">{scored.skip} — cleared</Tag>}
          {scored && !scored.skip && scored.pct != null && (
            <Tag tone={scored.pct >= 0.8 ? "good" : scored.pct >= 0.5 ? "accent" : "warn"} mono>
              {pctLabel(scored.pct)} · {scored.doneCount}/{scored.total}
            </Tag>
          )}
          {scored && !scored.skip && scored.pct == null && <Tag>nothing scheduled</Tag>}
          {shaped && shaped.gentler && <Tag tone="accent">Gentler week</Tag>}
          {shaped && shaped.weekType && <Tag>Week {String(shaped.weekType).toUpperCase()}</Tag>}
          {sched && sched.skip && <Tag tone="warn">Skipped · {sched.skip}</Tag>}
          {!day.log && <Tag>Rescheduled only</Tag>}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {sched && !sched.isEmpty && <Schedule sched={sched} />}

        {shaped && shaped.exercises.length > 0 && (
          <Group title="Exercises">
            <div className="space-y-2">
              {shaped.exercises.map((e) => (
                <Exercise key={e.id} ex={e} names={names} />
              ))}
            </div>
          </Group>
        )}

        {shaped && shaped.measurements.length > 0 && (
          <Group title="Measurements">
            <Pairs
              items={shaped.measurements.map((m) => ({
                key: m.id,
                label: labelFor(m.id, names),
                value: unitFor(m.id) ? `${m.value} ${unitFor(m.id)}` : String(m.value),
              }))}
            />
          </Group>
        )}

        {shaped && shaped.ratings.length > 0 && (
          <Group title="How it felt">
            <Pairs
              items={shaped.ratings.map((r) => ({ key: r.id, label: labelFor(r.id, names), value: String(r.value) }))}
            />
          </Group>
        )}

        {shaped && shaped.ticked.length > 0 && (
          <Group title="Ticked, no sets logged">
            <div className="flex gap-1.5 flex-wrap">
              {shaped.ticked.map((id) => (
                <Tag key={id} mono>
                  {labelFor(id, names)}
                </Tag>
              ))}
            </div>
          </Group>
        )}

        {shaped && shaped.checks.length > 0 && (
          <Group title="Daily checks">
            <div className="flex gap-1.5 flex-wrap">
              {shaped.checks.map((id) => (
                <Tag key={id} mono>
                  {labelFor(id, names)}
                </Tag>
              ))}
            </div>
          </Group>
        )}

        {shaped && shaped.unchecked.length > 0 && (
          <Group title="Opened but left unticked">
            <div className="flex gap-1.5 flex-wrap">
              {shaped.unchecked.map((id) => (
                <Tag key={id} mono tone="quiet">
                  {labelFor(id, names)}
                </Tag>
              ))}
            </div>
          </Group>
        )}

        {shaped && shaped.notes && (
          <Group title="Note">
            <p style={{ color: T.textPrimary }} className="text-sm">
              {shaped.notes}
            </p>
          </Group>
        )}

        {shaped && shaped.unknown && (
          <Group title="Other recorded fields">
            <pre
              style={{ fontFamily: FONT_MONO, color: T.textSecondary, background: T.bg, borderColor: T.border }}
              className="text-[11px] p-2 rounded-lg border overflow-x-auto"
            >
              {JSON.stringify(shaped.unknown, null, 2)}
            </pre>
          </Group>
        )}

        {shaped && shaped.isEmpty && (!sched || sched.isEmpty) && (
          <p style={{ color: T.textMuted }} className="text-xs">
            The day was opened but nothing was recorded.
          </p>
        )}
      </div>
    </div>
  );
}

function Schedule({ sched }) {
  return (
    <Group title="Schedule changes">
      <div className="space-y-1">
        {sched.slots.map((s) => (
          <Row
            key={s.slot}
            left={s.slot}
            right={s.value === null ? "cleared" : `set to ${s.value}`}
            dim={s.value === null}
          />
        ))}
        {sched.tests.map((t) => (
          <Row key={t.name} left={`${t.name} test`} right={t.due ? "marked due" : "marked not due"} dim={!t.due} />
        ))}
        {sched.activities.map((a) => (
          <Row key={a.id || a.name} left="added" right={a.name} />
        ))}
      </div>
    </Group>
  );
}

function Exercise({ ex, names }) {
  const substituted = Boolean(ex.sub);
  return (
    <div style={{ borderColor: T.border }} className="border-l-2 pl-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          style={{ fontFamily: FONT_MONO, color: substituted ? T.textMuted : T.textPrimary }}
          className="text-xs"
        >
          {labelFor(ex.id, names)}
          {substituted && (
            <>
              <span style={{ color: T.textMuted }}> → </span>
              <span style={{ color: T.accentAlt, fontFamily: FONT_BODY }} className="text-sm">
                {ex.sub.name}
              </span>
              {ex.sub.reason && <span style={{ color: T.textMuted }}> ({ex.sub.reason})</span>}
            </>
          )}
        </span>
        {ex.done === false && <Tag tone="quiet">not ticked</Tag>}
      </div>

      {formatSets(ex.sets) && (
        <p style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-sm mt-0.5">
          {formatSets(ex.sets)}
        </p>
      )}

      {ex.variants.map((v) => (
        <p key={v.slug} style={{ fontFamily: FONT_MONO, color: T.textPrimary }} className="text-sm mt-0.5">
          {formatSets(v.sets)}
          <span style={{ color: T.textMuted, fontFamily: FONT_BODY }} className="text-xs ml-2">
            {v.label}
          </span>
        </p>
      ))}

      {ex.note && (
        <p style={{ color: T.accent }} className="text-xs mt-1">
          📌 {ex.note}
        </p>
      )}
    </div>
  );
}

/* ------------------------------- small parts ------------------------------- */

function Shell({ children }) {
  return (
    <div style={{ background: T.bg, fontFamily: FONT_BODY, minHeight: "100vh" }} className="w-full">
      <FontImport />
      <div className="max-w-2xl mx-auto px-5 py-8">{children}</div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div>
      <p style={{ color: T.textSecondary }} className="text-[10px] uppercase tracking-wider mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function Pairs({ items }) {
  // A lone value in a two-column grid leaves its number stranded mid-row.
  const cols = items.length > 1 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`grid ${cols} gap-x-4 gap-y-1`}>
      {items.map((i) => (
        <Row key={i.key} left={i.label} right={i.value} />
      ))}
    </div>
  );
}

function Row({ left, right, dim }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span style={{ color: T.textSecondary }}>{left}</span>
      <span style={{ fontFamily: FONT_MONO, color: dim ? T.textMuted : T.textPrimary }} className="shrink-0">
        {right}
      </span>
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
