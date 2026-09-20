// Coach-PTapp — dashboard v1.
//
// One client at a time, chosen with the person switcher; below it, that
// person's logged days newest first, showing exactly what they recorded.
// No percentages and no adherence scoring: those need program definitions in
// Supabase, which is Phase 5. Everything here is a raw value the client typed.

import React, { useState, useEffect, useCallback } from "react";
import { currentUser, onAuthChange, sendMagicLink, signOut, isConfigured } from "./core/supabase.js";
import { loadAll } from "./core/data.js";
import { shapeDay, shapeOverride, formatDay, formatSets, labelFor, unitFor } from "./core/shape.js";
import { THEME as T, FONT_DISPLAY, FONT_BODY, FONT_MONO, COACH_VERSION } from "./config.jsx";

const PAGE = 20; // days rendered before "show earlier"

export default function CoachApp() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [visible, setVisible] = useState(PAGE);

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
  }, [user]);

  useEffect(() => setVisible(PAGE), [selectedId]);

  if (checking) {
    return (
      <Shell>
        <Muted>Checking your session…</Muted>
      </Shell>
    );
  }
  if (!user) return <SignIn />;

  const roster = data?.roster || [];
  const person = roster.find((p) => p.id === selectedId) || roster[0] || null;
  const days = person && data ? mergeDays(data, person.id) : [];

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
              onMore={() => setVisible((v) => v + PAGE)}
            />
          )}
        </>
      )}

      <p style={{ color: T.textMuted }} className="text-[11px] mt-8">
        Coach dashboard {COACH_VERSION} · raw logged values. Exercise names and adherence arrive with Phase 5.
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
            style={{ background: T.accent, color: "#14171C", opacity: busy ? 0.6 : 1 }}
            className="w-full mt-2 text-sm font-semibold py-2 rounded-lg focus:outline-none focus-visible:ring-2"
          >
            {busy ? "Sending…" : "Send sign-in link"}
          </button>
          {status && (
            <p style={{ color: status.ok ? T.accentAlt : "#C97388" }} className="text-xs mt-2">
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
              color: active ? "#14171C" : T.textSecondary,
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

function PersonPanel({ person, days, total, onMore }) {
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

      {total === 0 ? (
        <Notice tone="quiet" title="No days logged yet">
          {person.name} is sharing with you, and nothing has been recorded so far.
        </Notice>
      ) : (
        <>
          <div className="space-y-3">
            {days.map((d) => (
              <DayCard key={d.day} day={d} />
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
    </>
  );
}

/* -------------------------------- day card -------------------------------- */

function DayCard({ day }) {
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
                <Exercise key={e.id} ex={e} />
              ))}
            </div>
          </Group>
        )}

        {shaped && shaped.measurements.length > 0 && (
          <Group title="Measurements">
            <Pairs
              items={shaped.measurements.map((m) => ({
                key: m.id,
                label: labelFor(m.id),
                value: unitFor(m.id) ? `${m.value} ${unitFor(m.id)}` : String(m.value),
              }))}
            />
          </Group>
        )}

        {shaped && shaped.ratings.length > 0 && (
          <Group title="How it felt">
            <Pairs
              items={shaped.ratings.map((r) => ({ key: r.id, label: labelFor(r.id), value: String(r.value) }))}
            />
          </Group>
        )}

        {shaped && shaped.ticked.length > 0 && (
          <Group title="Ticked, no sets logged">
            <div className="flex gap-1.5 flex-wrap">
              {shaped.ticked.map((id) => (
                <Tag key={id} mono>
                  {labelFor(id)}
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
                  {labelFor(id)}
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
                  {labelFor(id)}
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

function Exercise({ ex }) {
  const substituted = Boolean(ex.sub);
  return (
    <div style={{ borderColor: T.border }} className="border-l-2 pl-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          style={{ fontFamily: FONT_MONO, color: substituted ? T.textMuted : T.textPrimary }}
          className="text-xs"
        >
          {ex.id}
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
    tone === "accent" ? T.accent : tone === "warn" ? "#C97388" : tone === "quiet" ? T.textMuted : T.textSecondary;
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
    <div style={{ background: T.card, borderColor: "#C97388" }} className="rounded-xl border px-4 py-3">
      <p style={{ color: "#C97388" }} className="text-sm">
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
