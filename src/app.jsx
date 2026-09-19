// Coach-PTapp — Phase 0 shell.
//
// Two states: signed out (ask for a magic link) and signed in (prove the
// session really has coach rights). The dashboard itself is Phase 1; what is
// here now is the smallest thing that answers "does the plumbing work", and
// it answers it with real rows read through real policies rather than a
// hardcoded "connected" badge.
//
// Note what this file does NOT do. It never filters by user id. Every query
// is a plain select, and the rows that come back are exactly the rows the
// database is willing to hand this session. If a client's sharing is switched
// off, their row disappears from this screen on its own — which is the point.

import React, { useState, useEffect, useCallback } from "react";
import { getClient, isConfigured, sendMagicLink, currentUser, onAuthChange, signOut } from "./core/supabase.js";
import { THEME, FONT_DISPLAY, FONT_BODY, FONT_MONO, COACH_VERSION } from "./config.jsx";

/* ------------------------------ Sign-in ------------------------------ */

function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // { kind: "sent" | "error", message }
  const [sending, setSending] = useState(false);

  const submit = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setStatus(null);
    const result = await sendMagicLink(email);
    setSending(false);
    setStatus(
      result.ok
        ? { kind: "sent", message: "Link sent. Open it in this browser to finish signing in." }
        : { kind: "error", message: result.error }
    );
  }, [email, sending]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: THEME.bg }}>
      <div
        style={{ background: THEME.card, borderColor: THEME.border }}
        className="w-full max-w-sm rounded-2xl border p-6"
      >
        <h1 style={{ fontFamily: FONT_DISPLAY, color: THEME.textPrimary }} className="text-xl font-bold">
          Coach
        </h1>
        <p style={{ color: THEME.textSecondary }} className="text-sm mt-1.5">
          Sign in to see training logs across your clients.
        </p>

        <label htmlFor="email" style={{ color: THEME.textSecondary }} className="block text-xs font-medium mt-5 mb-1.5">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="you@example.com"
          style={{ fontFamily: FONT_BODY, color: THEME.textPrimary, background: THEME.bg, borderColor: THEME.border }}
          className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus-visible:ring-2"
        />

        <button
          onClick={submit}
          disabled={sending}
          style={{ background: THEME.accent, color: "#14171C", opacity: sending ? 0.6 : 1 }}
          className="w-full mt-3 text-sm font-semibold py-2 rounded-lg focus:outline-none focus-visible:ring-2"
        >
          {sending ? "Sending…" : "Email me a sign-in link"}
        </button>

        {status && (
          <p
            style={{ color: status.kind === "sent" ? THEME.accentAlt : "#C97388" }}
            className="text-xs mt-3"
            role="status"
          >
            {status.message}
          </p>
        )}

        <p style={{ color: THEME.textMuted }} className="text-[11px] mt-5">
          Accounts are not created here. If the address is unknown, the link will not send.
        </p>
      </div>
    </div>
  );
}

/* --------------------------- Connection check --------------------------- */
//
// Temporary. Phase 1 replaces this whole component with the dashboard; it
// stays only until the plumbing has been seen working once from a browser.

function ConnectionCheck({ user }) {
  const [state, setState] = useState({ loading: true, error: null, people: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = getClient();
      if (!c) {
        setState({ loading: false, error: "No Supabase client.", people: [] });
        return;
      }

      // Two plain selects. RLS decides what comes back.
      const [profilesRes, logsRes] = await Promise.all([
        c.from("profiles").select("id, display_name"),
        c.from("day_logs").select("user_id, day"), // payload left out on purpose — it is large
      ]);
      if (cancelled) return;

      const error = profilesRes.error || logsRes.error;
      if (error) {
        setState({ loading: false, error: error.message, people: [] });
        return;
      }

      const logs = logsRes.data || [];
      const people = (profilesRes.data || [])
        .map((p) => {
          const theirs = logs.filter((l) => l.user_id === p.id);
          const days = theirs.map((l) => l.day).sort();
          return {
            id: p.id,
            name: p.display_name,
            isSelf: p.id === user.id,
            count: theirs.length,
            latest: days.length ? days[days.length - 1] : null,
          };
        })
        .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));

      setState({ loading: false, error: null, people, orphanLogs: logs.length - people.reduce((n, p) => n + p.count, 0) });
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (state.loading) {
    return (
      <p style={{ color: THEME.textMuted }} className="text-sm">
        Checking what this account can read…
      </p>
    );
  }

  if (state.error) {
    return (
      <div style={{ background: THEME.card, borderColor: "#C97388" }} className="rounded-2xl border p-4">
        <p style={{ color: THEME.textPrimary }} className="text-sm font-medium">
          The database refused that request
        </p>
        <p style={{ fontFamily: FONT_MONO, color: THEME.textSecondary }} className="text-xs mt-1.5">
          {state.error}
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: THEME.card, borderColor: THEME.border }} className="rounded-2xl border overflow-hidden">
      <div style={{ borderColor: THEME.border }} className="px-4 py-3 border-b">
        <h2 style={{ fontFamily: FONT_DISPLAY, color: THEME.textPrimary }} className="text-sm font-bold">
          What this account can read
        </h2>
        <p style={{ color: THEME.textMuted }} className="text-[11px] mt-0.5">
          Everyone whose data the database is willing to show you, and how much of it there is.
        </p>
      </div>

      {state.people.length === 0 ? (
        <p style={{ color: THEME.textMuted }} className="text-sm px-4 py-4">
          Nothing visible. Either no coach links exist for this account, or sharing is switched off.
        </p>
      ) : (
        state.people.map((p) => (
          <div
            key={p.id}
            style={{ borderColor: THEME.border }}
            className="px-4 py-3 border-b last:border-b-0 flex items-baseline justify-between gap-3"
          >
            <div className="min-w-0">
              <p style={{ color: THEME.textPrimary }} className="text-sm font-medium truncate">
                {p.name}
                {p.isSelf && (
                  <span style={{ color: THEME.textMuted }} className="font-normal">
                    {" "}
                    (you)
                  </span>
                )}
              </p>
              <p style={{ fontFamily: FONT_MONO, color: THEME.textMuted }} className="text-[11px] mt-0.5 truncate">
                {p.id}
              </p>
            </div>
            <p style={{ fontFamily: FONT_MONO, color: THEME.textSecondary }} className="text-xs shrink-0 text-right">
              {p.count} {p.count === 1 ? "day" : "days"}
              {p.latest && (
                <>
                  <br />
                  <span style={{ color: THEME.textMuted }}>latest {p.latest}</span>
                </>
              )}
            </p>
          </div>
        ))
      )}

      {state.orphanLogs > 0 && (
        <div style={{ borderColor: THEME.border }} className="px-4 py-3 border-t">
          <p style={{ color: THEME.accent }} className="text-xs">
            {state.orphanLogs} logged {state.orphanLogs === 1 ? "day belongs" : "days belong"} to someone with no profile
            row. Add one before Phase 1, or they will show up nameless.
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- App --------------------------------- */

export default function CoachApp() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await currentUser();
      if (cancelled) return;
      setUser(existing);
      setReady(true);
    })();
    const unsubscribe = onAuthChange((u) => setUser(u));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!isConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: THEME.bg }}>
        <p style={{ color: THEME.textSecondary, fontFamily: FONT_BODY }} className="text-sm">
          This build has no Supabase settings. Check src/config.jsx.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: THEME.bg }}>
        <p style={{ color: THEME.textMuted, fontFamily: FONT_BODY }} className="text-sm">
          Loading…
        </p>
      </div>
    );
  }

  if (!user) return <SignIn />;

  return (
    <div style={{ background: THEME.bg, fontFamily: FONT_BODY }} className="min-h-screen w-full pb-12">
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 style={{ fontFamily: FONT_DISPLAY, color: THEME.textPrimary }} className="text-xl font-bold">
              Coach
            </h1>
            <p style={{ fontFamily: FONT_MONO, color: THEME.textMuted }} className="text-[11px] mt-0.5 truncate">
              {user.email}
            </p>
          </div>
          <button
            onClick={signOut}
            style={{ borderColor: THEME.border, color: THEME.textSecondary }}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus-visible:ring-2"
          >
            Sign out
          </button>
        </div>

        <div className="mt-6">
          <ConnectionCheck user={user} />
        </div>

        <p style={{ color: THEME.textMuted }} className="text-[11px] mt-6">
          Scaffold {COACH_VERSION}. The dashboard replaces this screen in Phase 1.
        </p>
      </div>
    </div>
  );
}
